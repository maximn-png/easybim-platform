import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import UserState from '@/lib/models/UserState'

// A Mongo field path can't contain '.' and can't start with '$' — every real
// kc-api.js key (kc_docs, kc_note_<id>, kc_custom_tree_<wsId>, ...) is plain
// alnum/underscore/colon/» text, so reject anything else rather than let a
// key double as an update-operator path.
function isSafeKey(key: string) {
  return key.length > 0 && key.length < 200 && !key.includes('.') && !key.startsWith('$')
}

// PUT /api/kc/state/:key — upsert one key in the current user's blob.
// DELETE /api/kc/state/:key — remove one key.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key } = await params
  if (!isSafeKey(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  const { value } = await req.json()
  await connectDB()
  await UserState.findOneAndUpdate(
    { userId },
    { $set: { [`kv.${key}`]: value } },
    { upsert: true }
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key } = await params
  if (!isSafeKey(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  await connectDB()
  await UserState.findOneAndUpdate({ userId }, { $unset: { [`kv.${key}`]: '' } })

  return NextResponse.json({ ok: true })
}
