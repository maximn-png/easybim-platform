import mongoose, { Schema, Document, Model } from 'mongoose'

// A chat conversation between one user and an agent (Claude-style threads).
// `shared: true` marks the read-only team archive (the pre-conversations
// global chat thread) that every user can see but nobody can write to.
export interface IAgentConversation extends Document {
  agentKey: string
  userId?: string // Clerk userId of the owner; absent on the shared archive
  title: string
  shared: boolean
  lastMessageAt: Date
}

const AgentConversationSchema = new Schema<IAgentConversation>(
  {
    agentKey: { type: String, required: true },
    userId: String,
    title: { type: String, required: true },
    shared: { type: Boolean, default: false },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

AgentConversationSchema.index({ agentKey: 1, userId: 1, lastMessageAt: -1 })
AgentConversationSchema.index({ agentKey: 1, shared: 1 })

const AgentConversation: Model<IAgentConversation> =
  mongoose.models.AgentConversation ??
  mongoose.model<IAgentConversation>('AgentConversation', AgentConversationSchema)

export default AgentConversation
