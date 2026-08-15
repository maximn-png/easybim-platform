import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// A real, shared change-proposal queue: an intern/employee suggests either a
// whole new topic ('new', drafted in their own custom Textbook page first) or
// an edit/addition to an existing real document ('edit'/'add'). Team-lead
// approve/reject (see /api/kc/suggestions/[id]/resolve) is the only thing
// that ever moves a record out of 'pending' — this replaces kc_suggestions,
// which only ever round-tripped inside one browser's localStorage.

export type SuggestionType = 'new' | 'edit' | 'add'
export type SuggestionStatus = 'pending' | 'approved' | 'rejected'

export interface ISuggestion extends MongooseDocument {
  type: SuggestionType
  status: SuggestionStatus
  authorUserId: string
  authorName: string
  ws: number
  path: string[]
  title: string
  note?: string
  // type 'new'
  content?: string
  // type 'edit' | 'add' — sourceId identifies which real Document this
  // targets; kc-suggest.js itself never carries this (it only knows the
  // open DOM), so kc-api.js backfills it from KC.DocPage.data at submit time.
  sourceId?: string
  bIdx?: number
  tIdx?: number
  original?: string
  proposed?: string
  block?: boolean
  anchor?: string
  resolvedAt?: Date
  resolvedByUserId?: string
  resolvedByName?: string
  createdAt: Date
  updatedAt: Date
}

const SuggestionSchema = new Schema<ISuggestion>(
  {
    type: { type: String, enum: ['new', 'edit', 'add'], required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], required: true, default: 'pending' },
    authorUserId: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    ws: { type: Number, required: true },
    path: { type: [String], default: [] },
    title: { type: String, required: true },
    note: String,
    content: String,
    sourceId: String,
    bIdx: Number,
    tIdx: Number,
    original: String,
    proposed: String,
    block: Boolean,
    anchor: String,
    resolvedAt: Date,
    resolvedByUserId: String,
    resolvedByName: String,
  },
  { timestamps: true }
)

SuggestionSchema.index({ status: 1 })

const SuggestionModel =
  (mongoose.models.Suggestion as mongoose.Model<ISuggestion>) ??
  mongoose.model<ISuggestion>('Suggestion', SuggestionSchema)

export default SuggestionModel
