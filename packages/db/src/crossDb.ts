import mongoose, { type Connection } from 'mongoose'

// Read access to ANOTHER app's database on the shared Atlas cluster (e.g. the
// portal's Admin Console reading `easybim-epm` or `easybim-agents`). Same
// pattern as platform.ts: createConnection over this app's own MONGODB_URI
// with an explicit dbName override.
//
// ASSUMPTION: all app databases live on ONE cluster, so any app's MONGODB_URI
// can reach any dbName. If an app ever moves to its own cluster, this helper
// needs per-dbName URI overrides.
//
// Consumers should use raw driver access — `(await getCrossDbConnection(db))
// .collection('...')` — rather than re-declaring another app's Mongoose
// schemas; keep these reads read-only.

interface Entry {
  conn: Connection | null
  promise: Promise<Connection> | null
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCrossDb: Map<string, Entry> | undefined
}

const cache: Map<string, Entry> = global._mongooseCrossDb ?? new Map()
global._mongooseCrossDb = cache

export async function getCrossDbConnection(dbName: string): Promise<Connection> {
  let entry = cache.get(dbName)
  if (!entry) {
    entry = { conn: null, promise: null }
    cache.set(dbName, entry)
  }
  if (entry.conn) return entry.conn
  if (!entry.promise) {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('MONGODB_URI is not defined')
    entry.promise = mongoose
      .createConnection(uri, { dbName, bufferCommands: false })
      .asPromise()
      .catch((err) => {
        entry!.promise = null
        throw err
      })
  }
  entry.conn = await entry.promise
  return entry.conn
}
