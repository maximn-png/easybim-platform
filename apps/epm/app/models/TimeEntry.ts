import mongoose, { Document, Schema, Types } from 'mongoose'

// One person-day-project hours entry, written from the My Space week grid.
// This is the platform-native replacement for rows on the Monday TS boards
// (clean cut-over decided 2026-08 — no dual-write back to Monday).
//
// `date` is stored as a plain 'YYYY-MM-DD' string on purpose: entries are
// calendar days in the user's local sense, and Date objects would reintroduce
// timezone drift between the grid, the API and Mongo.
export interface ITimeEntry extends Document {
  userId:      string             // Clerk user id
  date:        string             // 'YYYY-MM-DD'
  projectKey:  string             // Project _id as string, or 'internal' for EasyBIM internal work
  projectId?:  Types.ObjectId     // set when projectKey is a real project
  projectName?: string            // denormalized for display / exports
  hours:       number             // 0.25 .. 24
  subject?:    string             // discipline (Model MGMT / Superposition / ...), optional in v1
  note?:       string
  source:      'manual' | 'calendar' | 'chat' | 'suggested'
  eventIds?:   string[]           // Google Calendar event ids logged into this cell
  createdAt:   Date
  updatedAt:   Date
}

const TimeEntrySchema = new Schema<ITimeEntry>(
  {
    userId:      { type: String, required: true, index: true },
    date:        { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    projectKey:  { type: String, required: true },
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String },
    hours:       { type: Number, required: true, min: 0, max: 24 },
    subject:     { type: String },
    note:        { type: String },
    source:      { type: String, enum: ['manual', 'calendar', 'chat', 'suggested'], default: 'manual' },
    eventIds:    { type: [String], default: undefined },
  },
  { timestamps: true }
)

// The week grid has exactly one cell per user × project × day.
TimeEntrySchema.index({ userId: 1, projectKey: 1, date: 1 }, { unique: true })
// "All my hours this week" and future per-project aggregations.
TimeEntrySchema.index({ userId: 1, date: 1 })
TimeEntrySchema.index({ projectId: 1, date: 1 })

const TimeEntry =
  (mongoose.models.TimeEntry as mongoose.Model<ITimeEntry>) ??
  mongoose.model<ITimeEntry>('TimeEntry', TimeEntrySchema)

export default TimeEntry
