import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import UserState from '@/lib/models/UserState'

function isSafeKey(key: string) {
  return key.length > 0 && key.length < 200 && !key.includes('.') && !key.startsWith('$')
}

// POST /api/kc/migrate — one-time import of pre-existing localStorage
// content (kc-api.js's bootstrapRemoteKV, first load after this shipped).
// Server-side "don't clobber": only fills keys the user doesn't already
// have stored, so calling this more than once (a second browser, a retry)
// is always harmless. Returns the merged full blob so the caller can adopt
// it in one round trip instead of GETting again right after.
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const incoming: Record<string, unknown> = body?.kv ?? {}

  await connectDB()
  const existing = await UserState.findOne({ userId }).lean()
  const existingKv = existing?.kv ?? {}

  const toSet: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (!isSafeKey(key)) continue
    if (Object.prototype.hasOwnProperty.call(existingKv, key)) continue
    toSet[`kv.${key}`] = value
  }

  if (Object.keys(toSet).length === 0) {
    return NextResponse.json({ kv: existingKv })
  }

  const updated = await UserState.findOneAndUpdate(
    { userId },
    { $set: toSet },
    { upsert: true, new: true }
  ).lean()

  return NextResponse.json({ kv: updated?.kv ?? {} })
}
