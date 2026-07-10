import { connectDB } from '@/lib/db/mongoose'
import AgentConversation, { IAgentConversation } from '@/lib/models/AgentConversation'
import AgentMessage from '@/lib/models/AgentMessage'

// Chat messages are AgentMessages with no runId (runs have their own threads).
export const CHAT_FILTER = (agentKey: string) => ({ agentKey, runId: { $exists: false } })

const LEGACY_TITLE = 'שיחת צוות (ארכיון)' // pre-conversations shared thread

/**
 * One-time lazy migration: attach pre-conversations chat messages (no
 * conversationId) to a single shared read-only archive conversation.
 * Cheap after the first run — the indexed query returns nothing.
 */
export async function ensureLegacyConversation(agentKey: string): Promise<void> {
  await connectDB()
  const orphaned = await AgentMessage.countDocuments({
    ...CHAT_FILTER(agentKey),
    conversationId: { $exists: false },
  })
  if (orphaned === 0) return

  let shared = await AgentConversation.findOne({ agentKey, shared: true })
  if (!shared) {
    const last = await AgentMessage.findOne({ ...CHAT_FILTER(agentKey), conversationId: { $exists: false } })
      .sort({ createdAt: -1 })
      .lean()
    shared = await AgentConversation.create({
      agentKey,
      title: LEGACY_TITLE,
      shared: true,
      lastMessageAt: (last as { createdAt?: Date } | null)?.createdAt ?? new Date(),
    })
  }
  await AgentMessage.updateMany(
    { ...CHAT_FILTER(agentKey), conversationId: { $exists: false } },
    { $set: { conversationId: shared._id } }
  )
}

/** All conversations the user may see: their own + the shared archive. */
export async function listConversations(agentKey: string, userId: string) {
  await connectDB()
  await ensureLegacyConversation(agentKey)
  const docs = await AgentConversation.find({
    agentKey,
    $or: [{ userId }, { shared: true }],
  })
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .lean()
  return docs.map((c) => ({
    id: String(c._id),
    title: c.title,
    shared: !!c.shared,
    lastMessageAt: c.lastMessageAt ?? null,
  }))
}

/** Load a conversation only if the user is allowed to see it. */
export async function getReadableConversation(
  agentKey: string,
  conversationId: string,
  userId: string
): Promise<IAgentConversation | null> {
  await connectDB()
  const convo = await AgentConversation.findOne({ _id: conversationId, agentKey })
  if (!convo) return null
  if (convo.shared || convo.userId === userId) return convo
  return null
}

/** Derive a sidebar title from the first user message. */
export function titleFromMessage(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim()
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine || 'שיחה חדשה'
}
