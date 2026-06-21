import mongoose, { Document, Schema, Types } from 'mongoose'

// A saved report = one Gmail draft the user created from the Export Report flow.
// We snapshot the rendered email (self-contained HTML with inline images) and the
// generated PDF at creation time, so history stays faithful even as issues change.

export interface IReport extends Document {
  projectId:       Types.ObjectId
  title:           string          // resolved template/variant title
  subject:         string          // email subject line
  recipients:      string[]        // recipient email addresses
  previewHtml:     string          // self-contained email HTML (images as data: URLs)
  pdf:             Buffer          // the generated PDF bytes
  pdfName:         string
  draftId?:        string          // Gmail draft id
  gmailUrl?:       string          // link to open the Gmail draft
  issueCount?:     number
  filtersSummary?: string
  groupBy?:        string
  createdByUserId: string          // Clerk user id
  createdByName?:  string          // display name at creation time
  createdAt:       Date
  updatedAt:       Date
}

const ReportSchema = new Schema<IReport>(
  {
    projectId:       { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title:           { type: String, required: true },
    subject:         { type: String, required: true },
    recipients:      { type: [String], default: [] },
    previewHtml:     { type: String, required: true },
    pdf:             { type: Buffer, required: true },
    pdfName:         { type: String, required: true },
    draftId:         String,
    gmailUrl:        String,
    issueCount:      Number,
    filtersSummary:  String,
    groupBy:         String,
    createdByUserId: { type: String, required: true },
    createdByName:   String,
  },
  { timestamps: true }
)

// Newest-first listing per project.
ReportSchema.index({ projectId: 1, createdAt: -1 })

const Report =
  (mongoose.models.Report as mongoose.Model<IReport>) ??
  mongoose.model<IReport>('Report', ReportSchema)

export default Report
