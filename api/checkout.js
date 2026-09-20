import { ObjectId } from 'mongodb'
import { getDb } from '../lib/db.js'
import { getStripe } from '../lib/stripe.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const items = Array.isArray(body.items) ? body.items : []
    const origin = String(body.origin || '')

    if (!items.length) return res.status(400).json({ error: 'Cart is empty' })
    if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
      return res.status(400).json({ error: 'Invalid origin' })
    }

    const ids = items.map(item => String(item.id)).filter(Boolean)
    const db = await getDb()
    const products = await db.collection('products').find({
      _id: { $in: ids.map(id => {
        try {
          return new ObjectId(id)
        } catch { return null }
      }).filter(Boolean) },
      active: { $ne: false },
    }).toArray()

    const productMap = new Map(products.map(product => [String(product._id), product]))
    const lineItems = []
    const orderItems = []

    for (const item of items) {
      const product = productMap.get(String(item.id))
      const quantity = Math.max(1, Math.min(99, Number(item.quantity) || 1))
      if (!product) return res.status(400).json({ error: `Product ${item.id} is unavailable` })

      const unitAmount = Math.round(Number(product.price) * 100)
      if (!Number.isInteger(unitAmount) || unitAmount < 0) return res.status(400).json({ error: `Invalid price for ${product.name}` })

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: unitAmount,
        },
        quantity,
      })

      orderItems.push({
        productId: String(product._id),
        name: product.name,
        unitPrice: Number(product.price),
        quantity,
      })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      billing_address_collection: 'auto',
      metadata: { orderItems: JSON.stringify(orderItems) },
    })

    await db.collection('checkout_sessions').insertOne({
      sessionId: session.id,
      status: 'created',
      items: orderItems,
      createdAt: new Date(),
    })

    return res.status(200).json({ url: session.url })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: error.message || 'Unable to create checkout session' })
  }
}
