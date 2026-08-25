import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentMessage from '@/lib/models/AgentMessage'
import { runChat, ChatTurn } from '@/lib/core/agentRuntime'
import { getOrCreatePostConversation } from '@/lib/core/conversations'
import { getPost } from '@/lib/agents/peacock/posts'
import { buildPostChatSystem, makePostChatTools, AGENT_KEY } from '@/lib/agents/peacock/postChat'

export const runtime = 'nodejs'
export const maxDuration = 300 // Peacock rewrites the draft inside the turn (~30-90s)

// The thread pinned to one post — the in-platform replacement for the Monday
// item's Updates column. Shared by the team: any signed-in portal user sees and
// can continue the discussion on a draft.

// GET — the post's messages (empty array before the first turn).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { postId } = await params

  await connectDB()
  const post = await getPost(postId)
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const convo = await getOrCreatePostConversation(AGENT_KEY, postId, post.title)
  const msgs = await AgentMessage.find({ conversationId: convo._id }).sort({ createdAt: 1 }).limit(200).lean()
  return NextResponse.json({
    messages: msgs.map((m) => ({
      id: String(m._id),
      role: m.role,
      content: m.content,
      createdAt: (m as { createdAt?: Date }).createdAt ?? null,
    })),
  })
}

// POST { message } — talk to Peacock about this draft. Returns the reply plus the
// post as it now stands, so the editor can show the rewrite without a refetch.
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { postId } = await params

  const body = await req.json().catch(() => ({}))
  const message: string = (body?.message ?? '').toString().trim()
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  await connectDB()
  const post = await getPost(postId)
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const convo = await getOrCreatePostConversation(AGENT_KEY, postId, post.title)
  await AgentMessage.create({ agentKey: AGENT_KEY, conversationId: convo._id, role: 'user', content: message, userId })

  const recent = await AgentMessage.find({ conversationId: convo._id }).sort({ createdAt: -1 }).limit(20).lean()
  const history: ChatTurn[] = recent
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  try {
    // Built from the post as of THIS turn, so the prompt carries the current draft.
    const system = await buildPostChatSystem(post)
    const reply = await runChat({ system, tools: makePostChatTools(postId, userId), history })
    const saved = await AgentMessage.create({
      agentKey: AGENT_KEY,
      conversationId: convo._id,
      role: 'assistant',
      content: reply,
    })
    convo.lastMessageAt = new Date()
    await convo.save()

    return NextResponse.json({
      reply: { id: String(saved._id), role: 'assistant', content: reply },
      post: await getPost(postId), // may have been rewritten by update_draft
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'chat failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
