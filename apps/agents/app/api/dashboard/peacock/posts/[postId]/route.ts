import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { updatePost, deletePost, UpdatePostInput } from '@/lib/agents/peacock/posts'

export const runtime = 'nodejs'

// PATCH /api/dashboard/peacock/posts/[postId] — update fields.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { postId } = await params

  const body = await req.json().catch(() => ({}))
  const patch: UpdatePostInput = {}
  for (const k of ['title', 'body', 'postType', 'status', 'notes', 'imageUrl', 'driveLink', 'linkedinUrl', 'projectNumber'] as const) {
    if (k in body) patch[k] = body[k]
  }
  if ('publishDate' in body) patch.publishDate = body.publishDate

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
