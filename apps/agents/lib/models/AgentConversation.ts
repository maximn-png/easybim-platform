import mongoose, { Schema, Document, Model } from 'mongoose'

// A chat conversation between one user and an agent (Claude-style threads).
// `shared: true` marks the read-only team archive (the pre-conversations
// global chat thread) that every user can see but nobody can write to.
// `postId` marks a thread pinned to one Peacock post — the in-platform
// replacement for the Monday item's Updates column. Post threads are visible to
// every signed-in user (the draft is team work, not private chat), so they are
// deliberately excluded from the personal conversation sidebar.
export interface IAgentConversation extends Document {
  agentKey: string
  userId?: string // Clerk userId of the owner; absent on the shared archive
  postId?: string // set for per-post draft threads (PeacockPost._id)
  title: string
  shared: boolean
  lastMessageAt: Date
}

const AgentConversationSchema = new Schema<IAgentConversation>(
  {
    agentKey: { type: String, required: true },
    userId: String,
    postId: String,
    title: { type: String, required: true },
    shared: { type: Boolean, default: false },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

AgentConversationSchema.index({ agentKey: 1, userId: 1, lastMessageAt: -1 })
AgentConversationSchema.index({ agentKey: 1, shared: 1 })
AgentConversationSchema.index({ postId: 1 }, { sparse: true })

const AgentConversation: Model<IAgentConversation> =
  mongoose.models.AgentConversation ??
  mongoose.model<IAgentConversation>('AgentConversation', AgentConversationSchema, 'agent_conversations')

export default AgentConversation
