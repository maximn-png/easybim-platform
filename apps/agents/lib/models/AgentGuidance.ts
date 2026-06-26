import mongoose, { Schema, Document, Model } from 'mongoose'

// Durable guidance the user gives an agent via chat. Active guidance is injected
// into the agent's author/watcher system prompts so it adapts over time.
export interface IAgentGuidance extends Document {
  agentKey: string
  text: string
  active: boolean
  createdBy?: string // Clerk userId
}

const AgentGuidanceSchema = new Schema<IAgentGuidance>(
  {
    agentKey: { type: String, required: true },
    text: { type: String, required: true },
    active: { type: Boolean, default: true },
    createdBy: String,
  },
  { timestamps: true }
)

AgentGuidanceSchema.index({ agentKey: 1, active: 1, createdAt: -1 })

const AgentGuidance: Model<IAgentGuidance> =
  mongoose.models.AgentGuidance ?? mongoose.model<IAgentGuidance>('AgentGuidance', AgentGuidanceSchema)

export default AgentGuidance
