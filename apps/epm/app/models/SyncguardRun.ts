import mongoose, { Schema } from 'mongoose'

// One document per Syncguard run — the queue AND the audit trail
// (docs/SYNCGUARD_PLAN.md). A run is created 'queued' by the dashboard or the
// scheduler, claimed by exactly one agent, then streamed to as it progresses.
//
// Status vocabulary, and why each exists:
//   queued          waiting for its target agent to claim it
//   claimed         an agent took it; Revit not up yet
//   running         Revit is open and working
//   success         synced and published
//   warning         finished, but Revit raised failures worth a human's eye
//   failed          hard error, timeout, or the agent was killed
//   needs_attention blocked on something a person must fix (a missing required
//                   parameter on Forma, a lost Autodesk sign-in) — distinct from
//                   'failed' because retrying changes nothing until it's resolved
//   cancelled       withdrawn before an agent started it
//   expired         never claimed (machine offline through its window)
export type SyncguardStatus =
  | 'queued' | 'claimed' | 'running'
  | 'success' | 'warning' | 'failed'
  | 'needs_attention' | 'cancelled' | 'expired'

// A run in one of these is finished for good: no more logs, no more step
// changes. Defined once because "is this over?" is asked from several routes and
// leaving `needs_attention` out of one of them lets a late line mutate a
// finished run.
export const TERMINAL_STATUSES: readonly SyncguardStatus[] = [
  'success', 'warning', 'failed', 'needs_attention', 'cancelled', 'expired',
] as const

// The subset an AGENT is allowed to report. 'cancelled' and 'expired' are the
// platform's to set, never the workstation's.
export const AGENT_OUTCOMES: readonly SyncguardStatus[] = [
  'success', 'warning', 'failed', 'needs_attention',
] as const

export interface ISyncguardStep {
  key: string                  // 'open-revit' | 'open-model' | 'sync-central' | 'publish'
  label: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  startedAt?: Date
  finishedAt?: Date
  message?: string
}

export interface ISyncguardRun {
  projectId: mongoose.Types.ObjectId
  agentId: string

  // Model identity. The GUIDs are what the workstation actually opens with —
  // ModelPathUtils.ConvertCloudGUIDsToCloudPath(region, projectGuid, modelGuid)
  // — captured at enqueue time so a later ACC re-crawl can't move the target
  // mid-run. revitVersion comes from the model's own revitProjectVersion, which
  // is authoritative in a way the project's Monday-sourced rvtVersion is not.
  modelName: string
  itemId: string
  accProjectId: string
  projectGuid?: string | null
  modelGuid?: string | null
  region?: 'US' | 'EMEA' | null
  revitVersion?: number | null

  trigger: 'manual' | 'schedule'
  triggeredBy?: string         // Clerk userId when manual
  status: SyncguardStatus
  attentionReason?: string     // why it needs a human, shown in the Resolve banner

  steps: ISyncguardStep[]
  log: { at: Date; level: 'info' | 'warn' | 'error'; text: string }[]

  claimedAt?: Date
  startedAt?: Date
  finishedAt?: Date
  durationMs?: number
  lastProgressAt?: Date        // watchdog: a claimed run silent too long is expired
  publishJobId?: string

  createdAt: Date
  updatedAt: Date
}

const StepSchema = new Schema<ISyncguardStep>(
  {
    key:        { type: String, required: true },
    label:      { type: String, required: true },
    status:     { type: String, enum: ['pending', 'running', 'done', 'skipped', 'failed'], default: 'pending' },
    startedAt:  Date,
    finishedAt: Date,
    message:    String,
  },
  { _id: false }
)

const LogSchema = new Schema(
  {
    at:    { type: Date, required: true },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    text:  { type: String, required: true },
  },
  { _id: false }
)

const SyncguardRunSchema = new Schema<ISyncguardRun>(
  {
    projectId:       { type: Schema.Types.ObjectId, required: true, index: true },
    agentId:         { type: String, required: true },

    modelName:       { type: String, required: true },
    itemId:          { type: String, required: true },
    accProjectId:    { type: String, required: true },
    projectGuid:     { type: String, default: null },
    modelGuid:       { type: String, default: null },
    region:          { type: String, enum: ['US', 'EMEA', null], default: null },
    revitVersion:    { type: Number, default: null },

    trigger:         { type: String, enum: ['manual', 'schedule'], required: true },
    triggeredBy:     { type: String },
    status:          { type: String, required: true, default: 'queued' },
    attentionReason: { type: String },

    steps:           { type: [StepSchema], default: [] },
    log:             { type: [LogSchema], default: [] },

    claimedAt:       Date,
    startedAt:       Date,
    finishedAt:      Date,
    durationMs:      Number,
    lastProgressAt:  Date,
    publishJobId:    String,
  },
  { timestamps: true }
)

// The claim query: oldest queued run for this agent.
SyncguardRunSchema.index({ agentId: 1, status: 1, createdAt: 1 })
// The card's history list.
SyncguardRunSchema.index({ projectId: 1, createdAt: -1 })
// Never two live runs against the same model.
SyncguardRunSchema.index(
  { itemId: 1, status: 1 },
  { partialFilterExpression: { status: { $in: ['queued', 'claimed', 'running'] } } }
)
// ~90 days of history, mirroring SyncRun.
SyncguardRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

const SyncguardRun =
  (mongoose.models.SyncguardRun as mongoose.Model<ISyncguardRun>) ??
  mongoose.model<ISyncguardRun>('SyncguardRun', SyncguardRunSchema, 'epm_syncguard_runs')

export default SyncguardRun

// The v1 pipeline. QA link-check and MEP maturity are deliberately out (v2).
export const DEFAULT_STEPS: ISyncguardStep[] = [
  { key: 'open-revit',   label: 'Opening Revit',      status: 'pending' },
  { key: 'open-model',   label: 'Opening model',      status: 'pending' },
  { key: 'sync-central', label: 'Sync with Central',  status: 'pending' },
  { key: 'publish',      label: 'Publish to Forma',   status: 'pending' },
]
