import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Suggestion from '@/lib/models/Suggestion'
import { hydrateName } from '@/lib/kc/authHelpers'

const MAX_TEXT = 20000
const TYPES = ['new', 'edit', 'add']

function str(v: unknown, max = MAX_TEXT): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined
}

// GET /api/kc/suggestions — every still-open suggestion. Read by both the
// author's own inline "pending" card and the team lead's review queue
// (kc-suggest.js's renderPending / kc-teamlead.js's QUEUE, today both read
// the same one localStorage array with no filtering by who's asking — this
// keeps that same shape, just backed by Mongo).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const items = await Suggestion.find({ status: 'pending' }).sort({ createdAt: 1 }).lean()
  return NextResponse.json({ items })
}

// POST /api/kc/suggestions — submit a new proposal. Identity (author) is
// always the real signed-in user, never whatever the client sends — the
// existing UI's KC.identity is just a role-preview stub, not a real name.
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !TYPES.includes(body.type)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof body.ws !== 'number' || !str(body.title)) {
    return NextResponse.json({ error: 'ws and title are required' }, { status: 400 })
  }

  const authorName = await hydrateName(userId)
  await connectDB()
  const doc = await Suggestion.create({
    type: body.type,
    status: 'pending',
    authorUserId: userId,
    authorName,
    ws: body.ws,
    path: Array.isArray(body.path) ? body.path.filter((p: unknown) => typeof p === 'string').slice(0, 20) : [],
    title: str(body.title, 200),
    note: str(body.note, 2000),
    content: str(body.content),
    sourceId: str(body.sourceId, 200),
    bIdx: typeof body.bIdx === 'number' ? body.bIdx : undefined,
    tIdx: typeof body.tIdx === 'number' ? body.tIdx : undefined,
    original: str(body.original),
    proposed: str(body.proposed),
    block: typeof body.block === 'boolean' ? body.block : undefined,
    anchor: str(body.anchor, 200),
  })

  return NextResponse.json({ item: doc.toObject() })
}
