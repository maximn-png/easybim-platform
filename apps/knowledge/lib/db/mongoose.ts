import dns from 'node:dns'
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in .env.local')
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseKnowledge: MongooseCache | undefined
}

const cached: MongooseCache =
  global._mongooseKnowledge ?? { conn: null, promise: null }
global._mongooseKnowledge = cached

export async function connectDB() {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    // This network's default DNS resolver can't answer SRV queries, which
    // mongodb+srv:// URIs require — lookups hang for seconds before failing
    // with querySrv ECONNREFUSED. Google's resolver handles it fine.
    dns.setServers(['8.8.8.8'])
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((conn) => conn)
      .catch((err) => {
        cached.promise = null
        throw err
      })
  }

  cached.conn = await cached.promise
  return cached.conn
}
