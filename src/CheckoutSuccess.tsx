import { useEffect, useState } from 'react'

type Order = {
id: string
customerEmail: string | null
paidAt: number
amountTotal: number | null
currency: string | null
items: { name: string; quantity: number | null; amountTotal: number | null; licenseKeys: string[] }[]
}

export default function CheckoutSuccess({ sessionId }: { sessionId: string }) {
const [order, setOrder] = useState<Order | null>(null)
const [error, setError] = useState('')
const [loading, setLoading] = useState(true)

useEffect(() => {
const controller = new AbortController()

fetch(`/api/checkout-order?session_id=${encodeURIComponent(sessionId)}`, {
signal: controller.signal,
})
.then(async response => {
const data = await response.json()
if (!response.ok) throw new Error(data.error || 'Could not load your order')
setOrder(data)
})
.catch(err => {
if (err.name !== 'AbortError') setError(err.message)
})
.finally(() => setLoading(false))

return () => controller.abort()
}, [sessionId])

const money = (amount: number | null) =>
amount === null
? '—'
: new Intl.NumberFormat('en-US', {
style: 'currency',
currency: order?.currency || 'usd',
}).format(amount / 100)

return (
<main className="sq-success">
<style>{`
.sq-success {
min-height: 100vh;
padding: 24px;
color: white;
font-family: system-ui, sans-serif;
background: linear-gradient(rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0.84)), url('/stay-quiet-welcome.jpeg') center top / cover fixed;
background: url('/stay-quiet-welcome.png') center top / cover no-repeat;
}
.sq-success * { box-sizing: border-box; }
.sq-success-wrap { max-width: 1300px; margin: auto; }
.sq-success-header, .sq-success-card {
background: #111;
border: 1px solid #444;
border-radius: 18px;
}
.sq-success-header {
padding: 22px 26px;
display: flex;
justify-content: space-between;
gap: 20px;
flex-wrap: wrap;
align-items: center;
}
.sq-success-header strong { font-size: 25px; letter-spacing: .04em; }
.sq-success-header span, .sq-muted { color: #aaa; }
.sq-success-title { text-align: center; padding: 50px 12px 36px; }
.sq-success-title { background: rgba(0, 0, 0, 0.78); border-radius: 18px; }
.sq-success-title h1 { font-size: clamp(34px, 5vw, 64px); margin: 0 0 10px; }
.sq-success-title p { color: #bbb; font-size: 18px; }
.sq-success-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
gap: 28px;
}
.sq-success-card { padding: 28px; margin-bottom: 26px; }
.sq-success-card h2 { margin: 0 0 12px; font-size: 24px; }
.sq-success-row {
display: flex;
justify-content: space-between;
gap: 20px;
padding: 17px 0;
border-bottom: 1px solid #333;
}
.sq-success-row:last-child { border-bottom: 0; }
.sq-success-row strong { text-align: right; }
.sq-success-home { color: white; text-decoration: underline; }
`}</style>

<div className="sq-success-wrap">
<header className="sq-success-header">
<strong>STAY QUIET!</strong>
<span>{order?.customerEmail || 'Your purchase'}</span>
</header>

<section className="sq-success-title">
<h1>WELCOME TO STAY QUIET!</h1>
<p>{loading ? 'Checking your payment…' : error || 'Order complete. Thank you for your purchase.'}</p>
</section>

{order && (
<>
<div className="sq-success-grid">
<section className="sq-success-card">
<h2>YOUR LICENSE KEY</h2>
{order?.items.some(item => item.licenseKeys?.length) ? (
  order.items.map((item, index) =>
    item.licenseKeys.map((key, keyIndex) => (
      <p key={`${index}-${keyIndex}`}>
        {item.name}: <code>{key}</code>
      </p>
    ))
  )
) : (
  <p className="sq-muted">No license key is available for this order yet.</p>
)}
</section>

<section className="sq-success-card">
<h2>ORDER DETAILS</h2>
<div className="sq-success-row">
<span className="sq-muted">Order</span>
<strong>#{order.id.slice(-12)}</strong>
</div>
<div className="sq-success-row">
<span className="sq-muted">Purchased</span>
<strong>{new Date(order.paidAt * 1000).toLocaleDateString()}</strong>
</div>
<div className="sq-success-row">
<span className="sq-muted">Total</span>
<strong>{money(order.amountTotal)}</strong>
</div>
</section>
</div>

<section className="sq-success-card">
<h2>YOUR PURCHASED PRODUCTS</h2>
{order.items.map((item, index) => (
<div className="sq-success-row" key={index}>
<span>{item.name} × {item.quantity || 1}</span>
<strong>{money(item.amountTotal)}</strong>
</div>
))}
</section>

<section className="sq-success-card">
<h2>DOWNLOADS</h2>
<p className="sq-muted">Download files have not been linked to this order yet.</p>
</section>
</>
)}

<a className="sq-success-home" href="/">Return to store</a>
</div>
</main>
)
}