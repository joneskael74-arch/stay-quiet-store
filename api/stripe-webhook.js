import { getDb } from '../lib/db.js'
import { getStripe } from '../lib/stripe.js'

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)

  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const signature = req.headers['stripe-signature']
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!signature || !secret) return res.status(400).send('Missing Stripe webhook configuration')

    const payload = await rawBody(req)
    const stripe = getStripe()
    const event = stripe.webhooks.constructEvent(payload, signature, secret)
    const db = await getDb()

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object
      const existing = await db.collection('orders').findOne({ stripeSessionId: session.id })

      if (!existing) {
        let items = []
        try { items = JSON.parse(session.metadata?.orderItems || '[]') } catch { /* ignore */ }

        await db.collection('orders').insertOne({
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent || null,
          customerEmail: session.customer_details?.email || session.customer_email || null,
          items,
          total: (session.amount_total || 0) / 100,
          currency: session.currency || 'usd',
          paymentStatus: session.payment_status || 'paid',
          fulfillmentStatus: 'unfulfilled',
          createdAt: new Date(),
        })
      }

      await db.collection('checkout_sessions').updateOne(
        { sessionId: session.id },
        { $set: { status: session.payment_status || event.type, updatedAt: new Date() } },
      )
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error(error)
    return res.status(400).send(`Webhook Error: ${error.message}`)
  }
}
