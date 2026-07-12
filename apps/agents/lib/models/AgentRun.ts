import mongoose, { Schema, Document, Model } from 'mongoose'

export type AgentRunTrigger = 'cron' | 'webhook' | 'manual'
export type AgentRunStatus = 'running' | 'done' | 'error'

export interface IAgentRun extends Document {
  agentKey: string // e.g. "linkedin"
  trigger: AgentRunTrigger
  pass: string // e.g. "author" | "watcher" | "plan"
  status: AgentRunStatus
  summary?: string
  error?: string
  // free-form context for the run (e.g. { itemId, signal: "Approved" })
  context?: Record<string, unknown>
  inputTokens?: number
  outputTokens?: number
  startedAt: Date
  finishedAt?: Date
}

const AgentRunSchema = new Schema<IAgentRun>(
  {
    agentKey: { type: String, required: true },
    trigger: { type: String, enum: ['cron', 'webhook', 'manual'], required: true },
    pass: { type: String, required: true },
    status: { type: String, enum: ['running', 'done', 'error'], default: 'running' },
    summary: String,
    error: String,
    context: Schema.Types.Mixed,
    inputTokens: Number,
    outputTokens: Number,
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
  },
  { timestamps: true }
)

AgentRunSchema.index({ agentKey: 1, startedAt: -1 })

const AgentRun: Model<IAgentRun> =
  mongoose.models.AgentRun ?? mongoose.model<IAgentRun>('AgentRun', AgentRunSchema, 'agent_runs')

export default AgentRun
