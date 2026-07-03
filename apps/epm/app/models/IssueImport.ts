import mongoose, { Document, Schema } from 'mongoose'
import type { AccIssue } from '@/lib/services/apsService'

// Issues imported from an ACC Excel/CSV export, for external-hub projects whose
// account we can't reach via the live API. One document per project; replaced
// wholesale on each re-upload. Read by GET /api/projects/[id]/issues so the
// reports page renders identically to API-sourced projects.

export interface IIssueImport extends Document {
  projectId:       string
  issues:          AccIssue[]
  fileName:        string
  count:           number
  uploadedByName?: string
  uploadedAt:      Date
}

const IssueSchema = new Schema<AccIssue>(
  {
    id:          { type: String, required: true },
    displayId:   String,   // ACC issue number shown to users (from the export's ID column)
    url:         String,   // deep link to the issue in ACC (from the ID cell hyperlink)
    title:       String,
    status:      String,
    issueType:   String,
    discipline:  String,
    description: String,
    assignedTo:  { type: String, default: null },
    createdBy:   { type: String, default: null },
    createdAt:   String,
    updatedAt:   { type: String, default: null },
    closedAt:    { type: String, default: null },
    dueDate:     { type: String, default: null },
    attributes:  { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
)

const IssueImportSchema = new Schema<IIssueImport>(
  {
    projectId:       { type: String, required: true, unique: true },
    issues:          { type: [IssueSchema], default: [] },
    fileName:        { type: String, default: '' },
    count:           { type: Number, default: 0 },
    uploadedByName:  String,
    uploadedAt:      { type: Date, default: Date.now },
  },
  { timestamps: true }
)

const IssueImport =
  (mongoose.models.IssueImport as mongoose.Model<IIssueImport>) ??
  mongoose.model<IIssueImport>('IssueImport', IssueImportSchema)

export default IssueImport
