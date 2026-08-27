import mongoose, { Document, Schema } from 'mongoose'

// A per-user "for all future meetings" mapping: when the user manually corrects
// which project(s) a calendar event belongs to and asks to remember it, the
// normalized event title is stored here and overrides the heuristic matcher for
// every future event with the same title (recurring meetings share titles).
export interface RuleProject {
  projectKey:    string   // Project _id as string, or 'internal'
  projectName:   string
  projectNumber: string
}

export interface IMeetingRule extends Document {
  userId:    string        // Clerk user id
  titleKey:  string        // normalized event title (lowercase, punctuation stripped)
  title:     string        // original title, for display
  projects:  RuleProject[]
  createdAt: Date
  updatedAt: Date
}

const RuleProjectSchema = new Schema<RuleProject>(
  {
    projectKey:    { type: String, required: true },
    projectName:   { type: String, required: true },
    projectNumber: { type: String, default: '' },
  },
  { _id: false }
)

const MeetingRuleSchema = new Schema<IMeetingRule>(
  {
    userId:   { type: String, required: true, index: true },
    titleKey: { type: String, required: true },
    title:    { type: String, required: true },
    projects: { type: [RuleProjectSchema], required: true },
  },
  { timestamps: true }
)

MeetingRuleSchema.index({ userId: 1, titleKey: 1 }, { unique: true })

const MeetingRule =
  (mongoose.models.MeetingRule as mongoose.Model<IMeetingRule>) ??
  mongoose.model<IMeetingRule>('MeetingRule', MeetingRuleSchema)

export default MeetingRule
