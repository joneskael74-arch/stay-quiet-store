import { useEffect, useMemo, useRef, useState } from 'react'
import logo from './assets/logo.png'
import heroImage from './assets/stay-quiet-hero.png'

type Product = {
  id: string
  name: string
  price: number
  category: string
  imageUrl: string
  tag: string | null
}

type CartItem = { id: string; quantity: number }

type AddForm = {
  name: string
  price: string
  category: string
  tag: string
  imageUrl: string
}

const CART_KEY = 'sq_cart'

export default function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addedId, setAddedId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [form, setForm] = useState<AddForm>({ name: '', price: '', category: '', tag: '', image: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    loadProducts()

    async function checkAdminSession() {
      try {
        const response = await fetch('/api/me', {
          credentials: 'include'
        })
        if (response.ok) {
          setIsAdmin(true)
        }
      } catch (err) {
        console.error('Admin session check failed', err)
      }
    }

    checkAdminSession()
  }, [])

  async function loadProducts() {
    try {
      setLoading(true)
      const response = await fetch('/api/store/products')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load products')
      setProducts(data)
      setError('')
    } catch (err) {
      console.error(err)
      setError('Products could not be loaded. Make sure MongoDB is connected.')
    } finally {
      setLoading(false)
    }
  }

  function addToCart(id: string) {
    setCart(items => {
      const existing = items.find(item => item.id === id)
      if (existing) return items.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...items, { id, quantity: 1 }]
    })
    setAddedId(id)
    setTimeout(() => setAddedId(null), 1400)
  }

  function changeQuantity(id: string, quantity: number) {
    setCart(items => quantity <= 0 ? items.filter(item => item.id !== id) : items.map(item => item.id === id ? { ...item, quantity } : item))
  }

  async function checkout() {
    if (!cart.length) return
    try {
      setCheckoutLoading(true)
      setError('')
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart, origin: window.location.origin }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Checkout failed')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setCheckoutLoading(false)
    }
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Product images must be 10 MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setForm(f => ({ ...f, image: String(reader.result || '') }))
    reader.readAsDataURL(file)
  }

  async function handleAdminLogin() {
    try {
      setError('')
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: adminEmail.trim(),
          password: adminPassword
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Login failed')
    setIsAdmin(true)
      setShowAdminLogin(false)
      setShowAddPanel(true)
      setAdminPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  async function handleAddProduct() {
    if (!adminToken.trim()) {
      setError('Enter your admin token before adding a product.')
      return
    }
    if (!form.name.trim() || !form.price.trim()) return
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken.trim() },
        body: JSON.stringify({
          name: form.name.trim(),
          price: Number(form.price),
          category: form.category.trim() || 'General',
          tag: form.tag.trim() || null,
          imageUrl: form.image,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to add product')
      setProducts(current => [data, ...current])
      setForm({ name: '', price: '', category: '', tag: '', image: '' })
      setAdminToken('')
      setShowAddPanel(false)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add product')
    }
  }

  async function removeProduct(id: string) {
    if (!window.confirm("Remove this product from the store?")) return

    try {
      setError("")
      const response = await fetch(`/api/products/${id}`, {
        method: "DELETE",
        credentials: "include"
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Unable to remove product")
      }

      setProducts(current => current.filter(product => product.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove product")
    }
  }

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map(p => p.category)))], [products])
  const [activeCategory, setActiveCategory] = useState('All')
  const filtered = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory)
  const cartProducts = cart.map(item => ({ item, product: products.find(p => p.id === item.id) })).filter((x): x is { item: CartItem; product: Product } => Boolean(x.product))
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = cartProducts.reduce((sum, { item, product }) => sum + product.price * item.quantity, 0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status === 'success') {
      setCart([])
      setError('Payment successful — thank you for your order.')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (status === 'cancelled') {
      setError('Checkout was cancelled. Your cart is still here.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  return (
    <div style={{ background: '#050505', color: '#ffffff', fontFamily: 'Outfit, system-ui, sans-serif', minHeight: '100vh' }}>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', height: '64px', background: 'rgba(11,11,10,0.88)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e1e1b' }}>
        <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#b8b3a8', cursor: 'pointer', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{menuOpen ? 'Close' : 'Menu'}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}><img src={logo} alt="Stay Quiet logo" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '2px', mixBlendMode: 'screen' }} /><span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '1rem', fontWeight: 300, letterSpacing: '0.28em', textTransform: 'uppercase' }}>Stay Quiet</span></div>
        <button onClick={() => setShowCart(true)} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          {cartCount > 0 && <span style={{ fontSize: '11px', background: '#c9b99a', color: '#0b0b0a', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500 }}>{cartCount}</span>}
        </button>
      </nav>

      {menuOpen && <div style={{ position: 'fixed', top: '64px', left: 0, right: 0, bottom: 0, zIndex: 40, background: '#050505', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '2.5rem' }}>{['Shop', 'Collections', 'About', 'Contact'].map(item => <button key={item} onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: '#ffffff', fontFamily: 'Fraunces, Georgia, serif', fontSize: '2.5rem', fontWeight: 300, letterSpacing: '0.05em', cursor: 'pointer', opacity: 0.85 }}>{item}</button>)}</div>}

      <section style={{ position: 'relative', height: '100vh', minHeight: '720px', overflow: 'hidden', background: '#000' }}>
<button
  aria-label="Shop Now"
  onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}
  style={{
    position: 'absolute',
    left: '7%',
    top: '57%',
    width: '18%',
    height: '8%',
    zIndex: 10,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer'
  }}
/>        <img  src={heroImage}
          alt="Stay Quiet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', zIndex: 0, pointerEvents: 'none' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.18) 48%, rgba(0,0,0,.08) 100%)', zIndex: 1 }} />

        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', alignItems: 'center', padding: '0 4%', maxWidth: '1500px', margin: '0 auto' }}>
          <div style={{ width: '100%', maxWidth: '650px', marginTop: '5rem' }}>
          </div>
        </div>
      </section>

      <section id="shop" style={{ padding: '5rem 6% 6rem', background: '#080808', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3rem', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', flexWrap: 'wrap' }}><h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 300, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', margin: 0 }}>Shop</h2>{categories.length > 1 && <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>{categories.map(cat => <button key={cat} onClick={() => setActiveCategory(cat)} style={{ background: activeCategory === cat ? '#c9b99a' : 'transparent', border: '1px solid ' + (activeCategory === cat ? '#c9b99a' : '#2e2e2a'), color: activeCategory === cat ? '#0b0b0a' : '#6b6760', padding: '0.4rem 1.1rem', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>{cat}</button>)}</div>}</div>
          {!isAdmin && <button onClick={() => setShowAdminLogin(true)} style={{ background: 'transparent', border: '1px solid #3a3835', color: '#b8b8b8', padding: '0.5rem 0.8rem', cursor: 'pointer' }}>Admin Login</button>}
            <button onClick={() => setShowAddPanel(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#080808', border: '1px solid #2e2e2a', color: '#c9b99a', padding: '0.6rem 1.4rem', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>＋ Add Product</button>
        </div>

        {error && <div style={{ marginBottom: '1.5rem', padding: '0.9rem 1rem', border: '1px solid #3a3835', color: '#c9b99a', fontSize: '12px' }}>{error}</div>}
        {loading && <div style={{ textAlign: 'center', padding: '6rem 2rem', color: '#aaa6a0' }}>Loading products…</div>}
        {!loading && products.length === 0 && <div style={{ textAlign: 'center', padding: '6rem 2rem', border: '1px dashed #2e2e2a' }}><p style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: '1.4rem', color: '#3a3835', marginBottom: '1rem' }}>No products yet</p><p style={{ color: '#4a4845', fontSize: '13px' }}>Use Add Product to create your first database-backed item.</p></div>}
        {filtered.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1px', background: '#1e1e1b', border: '1px solid #1e1e1b' }}>{filtered.map(product => <ProductCard key={product.id} product={product} added={addedId === product.id} onAdd={() => addToCart(product.id)} adminToken={isAdmin ? "admin" : ""} onRemove={() => removeProduct(product.id)} />)}</div>}
      </section>

      <footer style={{ borderTop: '1px solid #1e1e1b', padding: '3rem 6%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}><p style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '0.85rem' }}>Stay Quiet</p><a href="https://discord.gg/GJQRSVn3F" target="_blank" rel="noopener noreferrer" style={{ color: '#c9b99a', textDecoration: 'none', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', border: '1px solid #2e2e2a', padding: '0.6rem 1.2rem' }}>Join our Discord</a><p style={{ fontSize: '11px', color: '#3a3835' }}>© 2026 Stay Quiet. All rights reserved.</p></footer>

      {showAdminLogin && (
        <Overlay onClose={() => setShowAdminLogin(false)}>
          <h3 style={headingStyle}>Admin Login</h3>
          <p style={{ color: '#aaaaa0', fontSize: 13, marginBottom: '1rem' }}>
            Enter your admin email and password.
          </p>

          <label style={labelStyle}>Admin Email</label>
          <input
            value={adminEmail}
            onChange={e => setAdminEmail(e.target.value)}
            type="email"
            placeholder="Admin email"
            style={inputStyle}
          />

          <label style={labelStyle}>Password</label>
          <input
            value={adminPassword}
            onChange={e => setAdminPassword(e.target.value)}
            type="password"
            placeholder="Admin password"
            style={inputStyle}
          />

          <button
            onClick={handleAdminLogin}
            disabled={!adminEmail.trim() || !adminPassword}
            style={{
              width: '100%',
              marginTop: '1.25rem',
              background: '#c9b99a',
              border: 'none',
              color: '#0b0b0a',
              padding: '0.9rem',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: 'pointer'
            }}
          >
            Login to Admin
          </button>
        </Overlay>
      )}

      {showCart && <Overlay onClose={() => setShowCart(false)}><h3 style={headingStyle}>Your Bag</h3>{cartProducts.length === 0 ? <p style={{ color: '#aaa6a0' }}>Your bag is empty.</p> : <><div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{cartProducts.map(({ item, product }) => <div key={item.id} style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', borderBottom: '1px solid #252521', paddingBottom: '1rem' }}>{product.imageUrl && <img src={product.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover' }} />}<div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{product.name}</div><div style={{ color: '#aaa6a0', fontSize: 12 }}>${product.price.toFixed(2)}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button onClick={() => changeQuantity(item.id, item.quantity - 1)} style={qtyButton}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, item.quantity + 1)} style={qtyButton}>+</button></div></div>)}</div><div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span>Total</span><strong>${cartTotal.toFixed(2)}</strong></div><button onClick={checkout} disabled={checkoutLoading} style={primaryButton}>{checkoutLoading ? 'Opening Checkout…' : 'Checkout with Stripe'}</button></>}</Overlay>}

      {showAddPanel && <Overlay onClose={() => setShowAddPanel(false)}><h3 style={headingStyle}>Add Product</h3><p style={{ color: '#aaa6a0', fontSize: 12, lineHeight: 1.5 }}>This creates a real product in MongoDB. Your admin token is only sent to your Vercel API and is never stored in the browser.</p><label style={labelStyle}>Admin Token</label><input value={adminToken} onChange={e => setAdminToken(e.target.value)} type="password" style={inputStyle} /><label style={labelStyle}>Product Image</label><div onClick={() => fileRef.current?.click()} style={{ border: '1px dashed #2e2e2a', height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#0f0f0d', overflow: 'hidden' }}>{form.image ? <img src={form.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#4a4845', fontSize: 12 }}>Click to upload image (10 MB max)</span>}</div><input ref={fileRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} /><label style={labelStyle}>Product Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. FiveM / LUA Executor" style={inputStyle} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}><div><label style={labelStyle}>Price (USD) *</label><input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="29.99" type="number" min="0" step="0.01" style={inputStyle} /></div><div><label style={labelStyle}>Category</label><input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Scripts" style={inputStyle} /></div></div><label style={labelStyle}>Badge</label><input value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} placeholder="New, Sale, Hot" style={inputStyle} /><button onClick={handleAddProduct} disabled={!form.name.trim() || !form.price.trim() || !adminToken.trim()} style={primaryButton}>Add to Shop</button></Overlay>}
    </div>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div style={{ position: 'relative', zIndex: 101, background: '#080808', border: '1px solid #52524d', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: '2rem', color: '#ffffff', boxSizing: 'border-box' }}><button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', color: '#aaa6a0', cursor: 'pointer', fontSize: 20 }}>×</button>{children}</div></div>
}

function ProductCard({ product, added, onAdd, adminToken, onRemove }: { product: Product; added: boolean; onAdd: () => void; adminToken: string; onRemove: () => void }) {
  const [hovered, setHovered] = useState(false)
  return <div style={{ background: '#050505', position: 'relative' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}><div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', background: '#080808' }}>{product.imageUrl ? <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s ease, filter 0.4s ease', transform: hovered ? 'scale(1.04)' : 'scale(1)', filter: hovered ? 'brightness(0.45)' : 'brightness(0.8)' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2e2e2a' }}>No image</div>}{product.tag && <span style={{ position: 'absolute', top: '1rem', left: '1rem', background: '#c9b99a', color: '#0b0b0a', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '0.25rem 0.6rem' }}>{product.tag}</span>}<button onClick={onAdd} style={{ position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem', background: added ? '#c9b99a' : 'rgba(11,11,10,0.9)', border: '1px solid ' + (added ? '#c9b99a' : '#3a3835'), color: added ? '#0b0b0a' : '#f0ece3', padding: '0.75rem', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', opacity: hovered || added ? 1 : 0, transform: hovered || added ? 'translateY(0)' : 'translateY(6px)', transition: 'opacity 0.3s, transform 0.3s' }}>{added ? 'Added' : 'Add to Bag'}</button>
{isAdmin && (
  <button
    onClick={onRemove}
    style={{
      marginTop: "0.6rem",
      width: "100%",
      background: "transparent",
      border: "1px solid #8b4a4a",
      color: "#8b4a4a",
      padding: "0.65rem",
      cursor: "pointer"
    }}
  >
    Remove Product
  </button>
)}</div><div style={{ padding: '1rem 0.75rem' }}><p style={{ fontSize: 9, color: '#4a4845', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>{product.category}</p><p style={{ fontSize: 14, color: '#e0dbd2', marginBottom: '0.25rem' }}>{product.name}</p><p style={{ fontSize: 13, color: '#aaa6a0' }}>${product.price.toFixed(2)}</p></div></div>
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#aaa6a0', margin: '1rem 0 0.5rem' }
const inputStyle: React.CSSProperties = { width: '100%', background: '#0f0f0d', border: '1px solid #252521', color: '#ffffff', padding: '0.7rem 0.9rem', fontSize: 13, fontFamily: 'Outfit, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }
const headingStyle: React.CSSProperties = { fontFamily: 'Fraunces, Georgia, serif', fontWeight: 300, fontSize: '1.5rem', margin: '0 0 1.5rem' }
const primaryButton: React.CSSProperties = { width: '100%', marginTop: '1.25rem', background: '#c9b99a', border: 'none', color: '#0b0b0a', padding: '0.9rem', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }
const qtyButton: React.CSSProperties = { width: 28, height: 28, background: 'transparent', border: '1px solid #2e2e2a', color: '#ffffff', cursor: 'pointer' }
