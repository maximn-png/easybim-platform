import mongoose, { Document, Schema, Types } from 'mongoose'

// A saved report = one Gmail draft the user created from the Export Report flow.
// We snapshot the rendered email (self-contained HTML with inline images) and the
// generated PDF at creation time, so history stays faithful even as issues change.

// Compact per-issue snapshot used by the Progress comparison (status flow between
// two reports). Issues match across reports by displayId (ACC issue number),
// falling back to id.
export interface ReportIssueSnapshot {
  id:         string
  displayId?: string
  status:     string   // canonical key (normalizeStatus)
  discipline?: string
  // Extra dimensions the Progress modal can filter by (absent on older reports).
  assignedTo?: string
  createdBy?:  string
  issueType?:  string
  attributes?: Record<string, string>   // ACC custom attributes (title → value)
}

export interface IReport extends Document {
  projectId:       Types.ObjectId
  // 'email'    = created to be sent to recipients (Gmail draft).
  // 'internal' = produced for analytics/Progress only, never emailed.
  kind:            'email' | 'internal'
  title:           string          // resolved template/variant title
  subject:         string          // email subject line
  recipients:      string[]        // recipient email addresses
  previewHtml:     string          // self-contained email HTML (images as data: URLs)
  pdf:             Buffer          // the generated PDF bytes
  pdfName:         string
  xlsx?:           Buffer          // the generated Excel bytes
  xlsxName?:       string
  chartPng?:       Buffer          // analytics chart PNG — served publicly for the email body
  screenshotPng?:  Buffer          // optional instructional screenshot — served publicly for the email body
  draftId?:        string          // Gmail draft id
  gmailUrl?:       string          // link to open the Gmail draft
  // Set when the report was produced by a schedule rather than by hand.
  scheduleId?:     Types.ObjectId
  scheduleName?:   string
  sentAt?:         Date            // actually delivered (auto-send), not just drafted
  messageId?:      string          // Gmail message id of the sent mail
  issueCount?:     number
  issuesSnapshot?: ReportIssueSnapshot[]
  filtersSummary?: string
  groupBy?:        string
  createdByUserId: string          // Clerk user id
  createdByName?:  string          // display name at creation time
  createdAt:       Date
  updatedAt:       Date
}

const ReportIssueSnapshotSchema = new Schema<ReportIssueSnapshot>(
  {
    id:         { type: String, required: true },
    displayId:  String,
    status:     { type: String, required: true },
    discipline: String,
    assignedTo: String,
    createdBy:  String,
    issueType:  String,
    attributes: { type: Schema.Types.Mixed },
  },
  { _id: false }
)

const ReportSchema = new Schema<IReport>(
  {
    projectId:       { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    // Legacy rows predate this field → default to 'email' (they were all sent).
    kind:            { type: String, enum: ['email', 'internal'], default: 'email' },
    title:           { type: String, required: true },
    subject:         { type: String, required: true },
    recipients:      { type: [String], default: [] },
    previewHtml:     { type: String, required: true },
    pdf:             { type: Buffer, required: true },
    pdfName:         { type: String, required: true },
    xlsx:            Buffer,
    xlsxName:        String,
    chartPng:        Buffer,
    screenshotPng:   Buffer,
    draftId:         String,
    gmailUrl:        String,
    scheduleId:      { type: Schema.Types.ObjectId, ref: 'ReportSchedule', index: true },
    scheduleName:    String,
    sentAt:          Date,
    messageId:       String,
    issueCount:      Number,
    issuesSnapshot:  { type: [ReportIssueSnapshotSchema], default: undefined },
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
