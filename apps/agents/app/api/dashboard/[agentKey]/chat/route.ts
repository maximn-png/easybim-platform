import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentConversation from '@/lib/models/AgentConversation'
import AgentMessage from '@/lib/models/AgentMessage'
import { runChat, ChatTurn } from '@/lib/core/agentRuntime'
import { ensureLegacyConversation, getReadableConversation, titleFromMessage } from '@/lib/core/conversations'
import * as peacockChat from '@/lib/agents/peacock/chat'
import * as squirrelChat from '@/lib/agents/squirrel/chat'

export const runtime = 'nodejs'
export const maxDuration = 300 // an on-demand write tool runs a full agent pass (~30-90s)

// Agents that expose an advisor chat. buildChatSystem + makeChatTools per agent.
type ChatModule = {
  buildChatSystem: () => Promise<string>
  makeChatTools: (userId?: string) => unknown[]
}
const CHAT_AGENTS: Record<string, ChatModule> = {
  [peacockChat.AGENT_KEY]: peacockChat,
  [squirrelChat.AGENT_KEY]: squirrelChat,
}

// GET ?conversationId=... — messages of one conversation (owner or shared archive).
export async function GET(req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  if (!CHAT_AGENTS[agentKey]) return NextResponse.json({ error: 'No chat for this agent' }, { status: 404 })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ messages: [] })

  await connectDB()
  await ensureLegacyConversation(agentKey)
  const convo = await getReadableConversation(agentKey, conversationId, userId)
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const msgs = await AgentMessage.find({ conversationId: convo._id }).sort({ createdAt: 1 }).limit(200).lean()
  return NextResponse.json({
    shared: !!convo.shared,
    messages: msgs.map((m) => ({
      id: String(m._id),
      role: m.role,
      content: m.content,
      createdAt: (m as { createdAt?: Date }).createdAt ?? null,
    })),
  })
}

// POST { message, conversationId? } — send a message. Creates the conversation
// on the first message; writing to the shared archive is not allowed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  const chatModule = CHAT_AGENTS[agentKey]
  if (!chatModule) return NextResponse.json({ error: 'No chat for this agent' }, { status: 404 })

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const message: string = (body?.message ?? '').toString().trim()
  const conversationId: string | null = body?.conversationId ? String(body.conversationId) : null
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  await connectDB()

  let convo
  let created = false
  if (conversationId) {
    convo = await getReadableConversation(agentKey, conversationId, userId)
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    if (convo.shared) return NextResponse.json({ error: 'The shared archive is read-only' }, { status: 403 })
  } else {
    convo = await AgentConversation.create({
      agentKey,
      userId,
      title: titleFromMessage(message),
      lastMessageAt: new Date(),
    })
    created = true
  }

  // Persist the user turn.
  await AgentMessage.create({ agentKey, conversationId: convo._id, role: 'user', content: message, userId })

  // History (last ~20 turns) from THIS conversation only.
  const recent = await AgentMessage.find({ conversationId: convo._id }).sort({ createdAt: -1 }).limit(20).lean()
  const history: ChatTurn[] = recent
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  try {
    const system = await chatModule.buildChatSystem()
    const reply = await runChat({ system, tools: chatModule.makeChatTools(userId), history })
    const saved = await AgentMessage.create({ agentKey, conversationId: convo._id, role: 'assistant', content: reply })
    convo.lastMessageAt = new Date()
    await convo.save()
    return NextResponse.json({
      reply: { id: String(saved._id), role: 'assistant', content: reply },
      conversation: created
        ? { id: String(convo._id), title: convo.title, shared: false, lastMessageAt: convo.lastMessageAt }
        : { id: String(convo._id), lastMessageAt: convo.lastMessageAt },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'chat failed'
    return NextResponse.json({ error: msg, conversationId: String(convo._id) }, { status: 500 })
  }
}
