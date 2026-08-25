import mongoose, { Schema, Document, Model } from 'mongoose'

// The checklist Dog reviews an agreement against — the real IP of the old Python
// tool, lifted out of the prompt so Maxim can tune it from the dashboard without
// a deploy. One singleton doc per agentKey; every edit bumps `version`, and each
// review records the version that produced it.

export interface ChecklistTopic {
  title: string
  /** what to look for — goes into the prompt verbatim under the title */
  detail: string
}

const ChecklistTopicSchema = new Schema<ChecklistTopic>(
  { title: { type: String, required: true }, detail: { type: String, default: '' } },
  { _id: false }
)

export interface IReviewChecklist extends Document {
  agentKey: string
  topics: ChecklistTopic[]
  /** subjects to stay silent about even when present (generic boilerplate clauses) */
  ignore: string[]
  version: number
  updatedBy?: string
  createdAt: Date
  updatedAt: Date
}

const ReviewChecklistSchema = new Schema<IReviewChecklist>(
  {
    agentKey: { type: String, required: true, unique: true },
    topics: { type: [ChecklistTopicSchema], default: [] },
    ignore: { type: [String], default: [] },
    version: { type: Number, default: 1 },
    updatedBy: String,
  },
  { timestamps: true }
)

const ReviewChecklist: Model<IReviewChecklist> =
  mongoose.models.ReviewChecklist ??
  mongoose.model<IReviewChecklist>('ReviewChecklist', ReviewChecklistSchema, 'dog_review_checklist')

export default ReviewChecklist
