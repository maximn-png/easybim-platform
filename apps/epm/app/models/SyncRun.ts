import mongoose, { Schema } from 'mongoose'

// One document per /api/sync/projects run (hourly cron or manual Sync Now).
// The run summary (errors, counts, duration) used to exist only in the HTTP
// response and vanish; the Admin Console's Sync Health page reads this
// collection cross-DB. TTL keeps ~60 days of hourly history (~1,440 docs).
// Plain interface (not extending Document): mongoose's Document already
// declares an incompatible `errors` property.
export interface ISyncRun {
  startedAt: Date
  finishedAt: Date
  durationMs: number
  trigger: 'cron' | 'manual'
  triggeredBy?: string          // Clerk userId when manual
  ok: boolean                   // finished with zero errors and no fatal
  synced: number
  issueStatsUpdated: number
  errors: string[]
  fatal?: string                // outer-catch message when the whole run aborted
  createdAt: Date
  updatedAt: Date
}

const SyncRunSchema = new Schema<ISyncRun>(
  {
    startedAt:         { type: Date, required: true },
    finishedAt:        { type: Date, required: true },
    durationMs:        { type: Number, required: true },
    trigger:           { type: String, enum: ['cron', 'manual'], required: true },
    triggeredBy:       { type: String },
    ok:                { type: Boolean, required: true },
    synced:            { type: Number, default: 0 },
    issueStatsUpdated: { type: Number, default: 0 },
    errors:            { type: [String], default: [] },
    fatal:             { type: String },
  },
  { timestamps: true }
)

SyncRunSchema.index({ startedAt: -1 })
SyncRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 })

const SyncRun =
  (mongoose.models.SyncRun as mongoose.Model<ISyncRun>) ??
  mongoose.model<ISyncRun>('SyncRun', SyncRunSchema, 'epm_sync_runs')

export default SyncRun
