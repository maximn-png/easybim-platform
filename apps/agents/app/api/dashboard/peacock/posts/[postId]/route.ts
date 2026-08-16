import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getPost, updatePost, deletePost, shiftPostDates, UpdatePostInput } from '@/lib/agents/peacock/posts'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/posts/[postId] — one post (the drawer re-reads it
// after Peacock edits the draft).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { postId } = await params

  const post = await getPost(postId)
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ post })
}

// PATCH /api/dashboard/peacock/posts/[postId] — update fields, or `shiftDays` to
// move the whole timeline bar (Gantt drag) keeping its window length.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { postId } = await params

  const body = await req.json().catch(() => ({}))

  if (typeof body?.shiftDays === 'number' && body.shiftDays !== 0) {
    const post = await shiftPostDates(postId, Math.round(body.shiftDays))
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ post })
  }

  const patch: UpdatePostInput = {}
  for (const k of [
    'title', 'body', 'postType', 'status', 'notes', 'imageUrl', 'driveLink',
    'linkedinUrl', 'projectNumber', 'ownerUserId', 'ownerName', 'ownerImageUrl',
    'sourceUrl', 'sourceName',
  ] as const) {
    if (k in body) patch[k] = body[k]
  }
  if ('publishDate' in body) patch.publishDate = body.publishDate
  if ('draftStartDate' in body) patch.draftStartDate = body.draftStartDate

  // Engagement numbers from the drawer's Performance row. Whitelisted field by
  // field so a client can't write arbitrary shapes into the subdocument.
  // (null is ignored rather than clearing — nothing in the UI removes numbers.)
  if ('metrics' in body) {
    const m = body.metrics
    if (m && typeof m === 'object') {
      const metrics: Record<string, unknown> = {}
      for (const k of ['impressions', 'reactions', 'comments', 'reposts', 'clicks'] as const) {
        const n = Number(m[k])
        if (m[k] !== undefined && m[k] !== null && Number.isFinite(n) && n >= 0) metrics[k] = n
      }
      metrics.source = m.source === 'linkedin' || m.source === 'import' ? m.source : 'manual'
      metrics.syncedAt = new Date()
      patch.metrics = metrics as UpdatePostInput['metrics']
    }
  }

  const post = await updatePost(postId, patch)
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ post })
}

// DELETE /api/dashboard/peacock/posts/[postId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { postId } = await params
  const ok = await deletePost(postId)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
