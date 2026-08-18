import mongoose, { Document, Schema, Types } from 'mongoose'

// A recurring report: the same configuration the Export flow uses (template,
// grouping, filters, body, recipients), plus a cadence and a delivery mode.
// The cron (/api/cron/report-schedules) picks up rows whose nextRunAt has
// passed, runs them through the shared report pipeline, and re-arms nextRunAt.
//
// Runs happen as the OWNER: their stored Autodesk refresh token fetches the
// issues and their Google token sends the mail. If either goes stale the row
// parks in lastStatus:'needs-auth' until they reconnect.

export type ScheduleDelivery = 'send' | 'draft'
export type ScheduleRunStatus = 'ok' | 'failed' | 'needs-auth'

export interface ScheduleFilters {
  assignees:   string[]
  issueTypes:  string[]
  disciplines: string[]
  statuses:    string[]                                // narrows the emailed chart only
  extra:       { key: string; values: string[] }[]     // ad-hoc "any parameter" rows
}

export interface ScheduleFrequency {
  kind:        'daily' | 'weekly' | 'monthly'
  weekday?:    number   // 0=Sunday … 6=Saturday (weekly)
  dayOfMonth?: number   // 1–31, clamped to the month (monthly)
  hour:        number
  minute:      number
}

export interface ScheduleRunLog {
  at:         Date
  status:     ScheduleRunStatus
  error?:     string
  reportId?:  Types.ObjectId
  issueCount?: number
  recipients?: number
}

export interface IReportSchedule extends Document {
  projectId:      Types.ObjectId
  name:           string
  templateId:     string
  variantId?:     string
  groupBy:        string
  filters:        ScheduleFilters
  bodyText:       string
  modelLink?:     string
  recipients:     string[]
  deliveryMode:   ScheduleDelivery
  frequency:      ScheduleFrequency
  timezone:       string
  active:         boolean
  ownerUserId:    string        // Clerk user id — whose ACC + Gmail tokens are used
  ownerName?:     string
  ownerEmail?:    string
  nextRunAt:      Date
  lastRunAt?:     Date
  lastStatus?:    ScheduleRunStatus
  lastError?:     string
  runCount:       number
  history:        ScheduleRunLog[]
  createdAt:      Date
  updatedAt:      Date
}

const FiltersSchema = new Schema<ScheduleFilters>(
  {
    assignees:   { type: [String], default: [] },
    issueTypes:  { type: [String], default: [] },
    disciplines: { type: [String], default: [] },
    statuses:    { type: [String], default: [] },
    extra: {
      type: [new Schema({ key: String, values: [String] }, { _id: false })],
      default: [],
    },
  },
  { _id: false }
)

const FrequencySchema = new Schema<ScheduleFrequency>(
  {
    kind:       { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    weekday:    { type: Number, min: 0, max: 6 },
    dayOfMonth: { type: Number, min: 1, max: 31 },
    hour:       { type: Number, min: 0, max: 23, required: true },
    minute:     { type: Number, min: 0, max: 59, default: 0 },
  },
  { _id: false }
)

const RunLogSchema = new Schema<ScheduleRunLog>(
  {
    at:         { type: Date, required: true },
    status:     { type: String, enum: ['ok', 'failed', 'needs-auth'], required: true },
    error:      String,
    reportId:   { type: Schema.Types.ObjectId, ref: 'Report' },
    issueCount: Number,
    recipients: Number,
  },
  { _id: false }
)

const ReportScheduleSchema = new Schema<IReportSchedule>(
  {
    projectId:    { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name:         { type: String, required: true },
    templateId:   { type: String, required: true },
    variantId:    String,
    groupBy:      { type: String, default: 'discipline' },
    filters:      { type: FiltersSchema, default: () => ({}) },
    bodyText:     { type: String, default: '' },
    modelLink:    String,
    recipients:   { type: [String], default: [] },
    deliveryMode: { type: String, enum: ['send', 'draft'], default: 'send' },
    frequency:    { type: FrequencySchema, required: true },
    timezone:     { type: String, default: 'Asia/Jerusalem' },
    active:       { type: Boolean, default: true },
    ownerUserId:  { type: String, required: true, index: true },
    ownerName:    String,
    ownerEmail:   String,
    nextRunAt:    { type: Date, required: true },
    lastRunAt:    Date,
    lastStatus:   { type: String, enum: ['ok', 'failed', 'needs-auth'] },
    lastError:    String,
    runCount:     { type: Number, default: 0 },
    // Keep only the recent tail (trimmed on write) — enough for the panel's
    // "last 5 runs" without unbounded document growth.
    history:      { type: [RunLogSchema], default: [] },
  },
  { timestamps: true }
)

// The cron's only query: active rows whose time has come.
ReportScheduleSchema.index({ active: 1, nextRunAt: 1 })

const ReportSchedule =
  (mongoose.models.ReportSchedule as mongoose.Model<IReportSchedule>) ??
  mongoose.model<IReportSchedule>('ReportSchedule', ReportScheduleSchema)

export default ReportSchedule
