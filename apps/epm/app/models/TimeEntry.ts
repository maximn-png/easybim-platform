import mongoose, { Document, Schema, Types } from 'mongoose'

// One categorized hours entry: user × project × day × Subject × Subtopic.
// A week-grid cell (user × project × day) is the SUM of its category entries.
// This is the platform-native replacement for rows on the Monday TS boards
// (clean cut-over decided 2026-08 — no dual-write back to Monday).
//
// `date` is stored as a plain 'YYYY-MM-DD' string on purpose: entries are
// calendar days in the user's local sense, and Date objects would reintroduce
// timezone drift between the grid, the API and Mongo.
export interface ITimeEntry extends Document {
  userId:      string             // Clerk user id, or 'ext:<email>' for people without a portal account (historical Monday imports)
  userName?:   string             // denormalized display name — required in practice for 'ext:' users, set on imports
  date:        string             // 'YYYY-MM-DD'
  projectKey:  string             // Project _id as string, or 'internal' for EasyBIM internal work
  projectId?:  Types.ObjectId     // set when projectKey is a real project
  projectName?: string            // denormalized for display / exports
  hours:       number             // 0.25 .. 24
  subject:     string             // Model MGMT / Superposition / Modelling / EasyBIM Internal ('' = uncategorized)
  subtopic:    string             // Meetings / ProjectWork / Training / R&D ('' = uncategorized)
  note?:       string
  source:      'manual' | 'calendar' | 'chat' | 'suggested' | 'monday'
  eventIds?:   string[]           // Google Calendar event ids logged into this entry
  mondayItemIds?: string[]        // source:'monday' — contributing Monday TS row ids (one doc aggregates a slot)
  mondayBoards?: string[]         // source:'monday' — TS boards the rows came from ('TS-001'..'TS-005')
  createdAt:   Date
  updatedAt:   Date
}

const TimeEntrySchema = new Schema<ITimeEntry>(
  {
    userId:      { type: String, required: true, index: true },
    userName:    { type: String },
    date:        { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    projectKey:  { type: String, required: true },
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String },
    hours:       { type: Number, required: true, min: 0, max: 24 },
    subject:     { type: String, default: '' },
    subtopic:    { type: String, default: '' },
    note:        { type: String },
    source:      { type: String, enum: ['manual', 'calendar', 'chat', 'suggested', 'monday'], default: 'manual' },
    eventIds:    { type: [String], default: undefined },
    mondayItemIds: { type: [String], default: undefined },
    mondayBoards:  { type: [String], default: undefined },
  },
  { timestamps: true }
)

// One entry per category slot of a grid cell.
TimeEntrySchema.index({ userId: 1, projectKey: 1, date: 1, subject: 1, subtopic: 1 }, { unique: true })
// "All my hours this week" and future per-project aggregations.
TimeEntrySchema.index({ userId: 1, date: 1 })
TimeEntrySchema.index({ projectId: 1, date: 1 })

const TimeEntry =
  (mongoose.models.TimeEntry as mongoose.Model<ITimeEntry>) ??
  mongoose.model<ITimeEntry>('TimeEntry', TimeEntrySchema)

export default TimeEntry
