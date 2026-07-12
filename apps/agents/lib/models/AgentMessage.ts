import mongoose, { Schema, Document, Model } from 'mongoose'

// A message in an agent thread. Powers the chat UI (Phase 2) and
// agent-to-agent messaging (Phase 3): an agent can post into another
// agent's thread by setting `fromAgentKey`.
export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface IAgentMessage extends Document {
  agentKey: string
  runId?: mongoose.Types.ObjectId
  // chat messages belong to a conversation (per-user thread); run messages don't
  conversationId?: mongoose.Types.ObjectId
  role: AgentMessageRole
  content: string
  // for agent-to-agent: which agent authored this (defaults to agentKey)
  fromAgentKey?: string
  // optional tool-call metadata (name + JSON-ish input/result)
  toolName?: string
  toolData?: Record<string, unknown>
  userId?: string
}

const AgentMessageSchema = new Schema<IAgentMessage>(
  {
    agentKey: { type: String, required: true },
    runId: { type: Schema.Types.ObjectId, ref: 'AgentRun' },
    conversationId: { type: Schema.Types.ObjectId, ref: 'AgentConversation' },
    role: { type: String, enum: ['user', 'assistant', 'system', 'tool'], required: true },
    content: { type: String, default: '' },
    fromAgentKey: String,
    toolName: String,
    toolData: Schema.Types.Mixed,
    userId: String,
  },
  { timestamps: true }
)

AgentMessageSchema.index({ agentKey: 1, createdAt: -1 })
AgentMessageSchema.index({ runId: 1, createdAt: 1 })
AgentMessageSchema.index({ conversationId: 1, createdAt: 1 })

const AgentMessage: Model<IAgentMessage> =
  mongoose.models.AgentMessage ?? mongoose.model<IAgentMessage>('AgentMessage', AgentMessageSchema, 'agent_messages')

export default AgentMessage
