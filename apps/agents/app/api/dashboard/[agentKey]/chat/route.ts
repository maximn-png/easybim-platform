import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentMessage from '@/lib/models/AgentMessage'
import { runChat, ChatTurn } from '@/lib/core/agentRuntime'
import { AGENT_KEY, buildChatSystem, makeChatTools } from '@/lib/agents/peacock/chat'

export const runtime = 'nodejs'
export const maxDuration = 300 // an on-demand draft_item_now runs a full author pass (~30-90s)

// Chat messages are AgentMessages with no runId (separate from author/watcher passes).
const CHAT_FILTER = (agentKey: string) => ({ agentKey, runId: { $exists: false } })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  if (agentKey !== AGENT_KEY) return NextResponse.json({ error: 'No chat for this agent' }, { status: 404 })
  await connectDB()
  const msgs = await AgentMessage.find(CHAT_FILTER(agentKey)).sort({ createdAt: 1 }).limit(100).lean()
  return NextResponse.json({
    messages: msgs.map((m) => ({ id: String(m._id), role: m.role, content: m.content, createdAt: (m as { createdAt?: Date }).createdAt ?? null })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  if (agentKey !== AGENT_KEY) return NextResponse.json({ error: 'No chat for this agent' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const message: string = (body?.message ?? '').toString().trim()
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  const { userId } = await auth()
  await connectDB()

  // Persist the user turn.
  await AgentMessage.create({ agentKey, role: 'user', content: message, userId: userId ?? undefined })

  // Build history (last ~20 turns) for context.
  const recent = await AgentMessage.find(CHAT_FILTER(agentKey)).sort({ createdAt: -1 }).limit(20).lean()
  const history: ChatTurn[] = recent
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  try {
    const system = await buildChatSystem()
    const reply = await runChat({ system, tools: makeChatTools(userId ?? undefined), history })
    const saved = await AgentMessage.create({ agentKey, role: 'assistant', content: reply })
    return NextResponse.json({ reply: { id: String(saved._id), role: 'assistant', content: reply } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'chat failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
