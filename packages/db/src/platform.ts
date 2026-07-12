import mongoose, { type Connection, type Model } from 'mongoose'

// Platform-wide data (the user activity log) lives in ONE shared database on
// the cluster — `easybim-platform` — regardless of which app-specific database
// each app's MONGODB_URI names. Every app reads/writes the same collection.
const PLATFORM_DB = 'easybim-platform'
const RETENTION_DAYS = 90

export interface ActivityEventDoc {
  userId: string
  type: 'card_open' | 'app_visit'
  /** App grant key / card id: 'newsletter' | 'epm' | 'agents' | ... */
  app: string
  /** For app_visit: number of throttle-window hits folded into this doc. */
  count: number
  /** For app_visit: hour bucket ('2026-07-12T09') — one doc per user/app/hour. */
  bucket?: string
  createdAt: Date
  updatedAt: Date
}

const ActivityEventSchema = new mongoose.Schema<ActivityEventDoc>(
  {
    userId: { type: String, required: true },
    type: { type: String, required: true, enum: ['card_open', 'app_visit'] },
    app: { type: String, required: true },
    count: { type: Number, default: 1 },
    bucket: { type: String },
  },
  { timestamps: true }
)
ActivityEventSchema.index({ userId: 1, createdAt: -1 })
ActivityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 })
ActivityEventSchema.index(
  { userId: 1, app: 1, type: 1, bucket: 1 },
  { unique: true, partialFilterExpression: { type: 'app_visit' } }
)

interface PlatformCache {
  conn: Connection | null
  promise: Promise<Connection> | null
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoosePlatform: PlatformCache | undefined
}

const cached: PlatformCache = global._mongoosePlatform ?? { conn: null, promise: null }
global._mongoosePlatform = cached

async function connectPlatformDB(): Promise<Connection> {
  if (cached.conn) return cached.conn
  if (!cached.promise) {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not defined')
    cached.promise = mongoose
      .createConnection(uri, { dbName: PLATFORM_DB, bufferCommands: false })
      .asPromise()
      .catch((err) => {
        cached.promise = null
        throw err
      })
  }
  cached.conn = await cached.promise
  return cached.conn
}

export async function getActivityEventModel(): Promise<Model<ActivityEventDoc>> {
  const conn = await connectPlatformDB()
  return (
    (conn.models.ActivityEvent as Model<ActivityEventDoc>) ??
    conn.model<ActivityEventDoc>('ActivityEvent', ActivityEventSchema)
  )
}

export async function logCardOpen(userId: string, app: string): Promise<void> {
  const ActivityEvent = await getActivityEventModel()
  await ActivityEvent.create({ userId, type: 'card_open', app })
}

// In-memory throttle: repeat page loads within the same hour skip the DB
// entirely. Per serverless instance — a cold start just costs one extra
// (idempotent) upsert.
const visitLogged = new Map<string, string>()

export async function logAppVisit(userId: string, app: string): Promise<void> {
  const bucket = new Date().toISOString().slice(0, 13)
  const key = `${userId}:${app}`
  if (visitLogged.get(key) === bucket) return
  const ActivityEvent = await getActivityEventModel()
  await ActivityEvent.updateOne(
    { userId, app, type: 'app_visit', bucket },
    { $inc: { count: 1 } },
    { upsert: true }
  )
  visitLogged.set(key, bucket)
  if (visitLogged.size > 5000) visitLogged.clear()
}
