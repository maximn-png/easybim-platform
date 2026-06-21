import mongoose, { Document, Schema } from 'mongoose'

// ── Sub-types ──────────────────────────────────────────────────────────────

export interface TeamMember {
  name: string
  email?: string
  avatarUrl?: string
  mondayId?: string
  profileUrl?: string
}

export interface ExternalIds {
  mondayBoardId:  string          // MA-004 board ID (7321609006)
  mondayBoardUrl: string          // MA-004 board URL
  mainBoardUrl?:  string          // The project's main Monday board (MA-003 "Main Board" link column)
  mondayItemId?:  string          // MA-004 item ID for this project
  ma003ItemId?:   string          // MA-003 item ID (links TS-001 timesheet rows)
  driveFolderId?: string          // Google Drive folder ID (Phase 3)
  driveFolderUrl?: string         // Google Drive folder URL (Phase 3)
  hoursSheetId?:  string
  hoursSheetUrl?: string
  accProjectId?:  string          // Autodesk ACC project GUID
  accProjectUrl?: string          // Full ACC project URL
  accLinkSource?: 'auto' | 'manual' | 'ma003' // 'auto' = matched by projectNumber; 'manual' = user-selected (sticky); 'ma003' = parsed from the Monday MA-003 ACC link (typically a client hub)
  accExternalHub?: boolean        // true = linked ACC project lives OUTSIDE the EasyBIM account (client hub)
  accHubId?:      string
}

export type ProjectStatus = 'Working on it' | 'On Hold' | 'Not Started' | 'Done' | 'Stuck'
export type SyncStatus = 'ok' | 'partial' | 'error' | 'never'

// Which discipline "team" a timesheet Subject (label__1) is counted under on the
// Hours Analytics page. 'none' = not counted in either bank. Defaults: the
// canonical 'Model MGMT'/'Superposition' subjects map to their own team; every
// other subject defaults to 'none' until the user assigns it.
export type HoursTeam = 'modelMgmt' | 'superposition' | 'none'

export interface HoursConfig {
  // Subject label (exactly as stored in Monday's label__1) → team assignment.
  subjectTeam: Record<string, HoursTeam>
}

export interface ProjectSnapshot {
  status:            ProjectStatus | null
  milestoneProgress: number | null
  hoursProgress:     number | null
  budgetHours:       number | null  // MA-004.formula8 (fee ÷ 300)
  actualHours:       number | null  // SUM(TS-001.numeric) for this project
  bimManager?:       TeamMember
  mepCoordinator?:   TeamMember
  bimModeller?:      TeamMember
  openIssuesCount:   number | null
  accModelStatus?:   string | null
  lastSyncedAt:      Date | null
  syncStatus:        SyncStatus
  syncError?:        string
  mondayLastSyncedAt: Date | null
  sheetsLastSyncedAt: Date | null
  accLastSyncedAt:    Date | null
}

// ── Document interface ─────────────────────────────────────────────────────

export interface IProject extends Document {
  projectName:   string
  projectNumber: string
  externalIds:   ExternalIds
  snapshot:      ProjectSnapshot
  hoursConfig?:  HoursConfig
  isActive:      boolean
  displayOrder?: number
  createdAt:     Date
  updatedAt:     Date
}

// ── Sub-schemas ────────────────────────────────────────────────────────────

const TeamMemberSchema = new Schema<TeamMember>(
  {
    name:       { type: String, required: true },
    email:      String,
    avatarUrl:  String,
    mondayId:   String,
    profileUrl: String,
  },
  { _id: false }
)

const ExternalIdsSchema = new Schema<ExternalIds>(
  {
    mondayBoardId:  { type: String, required: true },
    mondayBoardUrl: { type: String, required: true },
    mainBoardUrl:   String,
    mondayItemId:   String,
    ma003ItemId:    String,
    driveFolderId:  String,
    driveFolderUrl: String,
    hoursSheetId:   String,
    hoursSheetUrl:  String,
    accProjectId:   String,
    accProjectUrl:  String,
    accLinkSource:  { type: String, enum: ['auto', 'manual', 'ma003'] },
    accExternalHub: Boolean,
    accHubId:       String,
  },
  { _id: false }
)

const SnapshotSchema = new Schema<ProjectSnapshot>(
  {
    status: {
      type:    String,
      enum:    ['Working on it', 'On Hold', 'Not Started', 'Done', 'Stuck'],
      default: null,
    },
    milestoneProgress: { type: Number, min: 0, max: 100, default: null },
    hoursProgress:     { type: Number, min: 0, max: 100, default: null },
    budgetHours:       { type: Number, min: 0, default: null },
    actualHours:       { type: Number, min: 0, default: null },
    bimManager:        TeamMemberSchema,
    mepCoordinator:    TeamMemberSchema,
    bimModeller:       TeamMemberSchema,
    openIssuesCount:   { type: Number, min: 0, default: null },
    accModelStatus:    { type: String, default: null },
    lastSyncedAt:      { type: Date, default: null },
    syncStatus: {
      type:    String,
      enum:    ['ok', 'partial', 'error', 'never'],
      default: 'never',
    },
    syncError:          String,
    mondayLastSyncedAt: { type: Date, default: null },
    sheetsLastSyncedAt: { type: Date, default: null },
    accLastSyncedAt:    { type: Date, default: null },
  },
  { _id: false }
)

const HoursConfigSchema = new Schema<HoursConfig>(
  {
    // Record<subjectLabel, 'modelMgmt' | 'superposition' | 'none'>. Stored as a
    // free-form object — the whole map is replaced on save, so Mixed is fine.
    subjectTeam: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
)

// ── Main schema ────────────────────────────────────────────────────────────

const ProjectSchema = new Schema<IProject>(
  {
    projectName:   { type: String, required: true },
    projectNumber: { type: String, required: true },
    externalIds:   { type: ExternalIdsSchema, required: true },
    snapshot:      { type: SnapshotSchema, default: () => ({}) },
    hoursConfig:   { type: HoursConfigSchema, default: undefined },
    isActive:      { type: Boolean, default: true },
    displayOrder:  Number,
  },
  { timestamps: true }
)

ProjectSchema.index({ projectNumber: 1 }, { unique: true })
ProjectSchema.index({ isActive: 1, displayOrder: 1 })
ProjectSchema.index({ 'snapshot.lastSyncedAt': 1 })
ProjectSchema.index({ 'externalIds.mondayItemId': 1 })
ProjectSchema.index({ 'externalIds.ma003ItemId': 1 })

// ── Model export ───────────────────────────────────────────────────────────

const Project =
  (mongoose.models.Project as mongoose.Model<IProject>) ??
  mongoose.model<IProject>('Project', ProjectSchema)

export default Project
