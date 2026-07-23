import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { listPosts, createPost, pipelineCounts } from '@/lib/agents/peacock/posts'
import { POST_STATUSES, PostStatus } from '@/lib/models/PeacockPost'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/posts?status=&counts=1 — list posts (+ optional pipeline counts).
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const statusParam = req.nextUrl.searchParams.get('status')
  const status = statusParam && (POST_STATUSES as string[]).includes(statusParam) ? (statusParam as PostStatus) : undefined

  const posts = await listPosts(status ? { status } : {})
  const counts = req.nextUrl.searchParams.get('counts') ? await pipelineCounts() : undefined
  return NextResponse.json({ posts, counts })
}

// POST /api/dashboard/peacock/posts — create a post.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const title = (body?.title ?? '').toString().trim()
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const post = await createPost({
    title,
    body: body?.body,
    postType: body?.postType,
    status: body?.status,
    publishDate: body?.publishDate,
    projectNumber: body?.projectNumber,
    notes: body?.notes,
    createdBy: userId,
  })
  return NextResponse.json({ post }, { status: 201 })
}
