import { MongoClient } from 'mongodb'

let clientPromise

export async function getDb() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB
  if (!uri || !dbName) throw new Error('Missing MONGODB_URI or MONGODB_DB')

  if (!clientPromise) {
    const client = new MongoClient(uri)
    clientPromise = client.connect()
  }

  const client = await clientPromise
  return client.db(dbName)
}
