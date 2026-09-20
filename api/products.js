import { getDb } from '../lib/db.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const db = await getDb()
    const collection = db.collection('products')

    if (req.method === 'GET') {
      const products = await collection.find({ active: { $ne: false } }).sort({ createdAt: -1 }).toArray()
      return res.status(200).json(products.map(({ _id, ...product }) => ({ ...product, id: String(_id) })))
    }

    if (req.method === 'POST') {
      if (!process.env.ADMIN_TOKEN || req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const { name, price, category = 'General', image = '', tag = null } = body
      const numericPrice = Number(price)

      if (!name?.trim() || !Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: 'name and a valid non-negative price are required' })
      }

      const product = {
        name: name.trim(),
        price: Math.round(numericPrice * 100) / 100,
        category: String(category || 'General'),
        image: String(image || ''),
        tag: tag ? String(tag) : null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const result = await collection.insertOne(product)
      return res.status(201).json({ ...product, id: String(result.insertedId) })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Server error' })
  }
}
