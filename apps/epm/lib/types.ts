export interface TeamMemberPayload {
  name: string
  avatarUrl?: string
  profileUrl?: string
}

export interface ProjectLinks {
  mondayBoard: string
  dedicatedBoard?: string   // The project's own Monday board, matched by project number
  mainBoard?: string   // MA-003 "Main Board" link — the project's main Monday board
  driveFolder: string
  hoursSheet?: string
  acc?: string
}

export type AccLinkSource = 'auto' | 'manual' | 'ma003'

// Discipline team a timesheet Subject is counted under on the Hours Analytics
// page. 'none' = not counted in either bank. Mirrors HoursTeam in the model.
export type HoursTeam = 'modelMgmt' | 'superposition' | 'none'

export interface HoursConfig {
  subjectTeam: Record<string, HoursTeam>
}

// Per-discipline milestone completion (mirrors MilestoneDiscipline in the model).
export interface MilestoneDiscipline {
  key: string
  label: string
  completed: number
  total: number
  progress: number
}

export interface ProjectSyncMeta {
  lastSyncedAt: string | null
  syncStatus: 'ok' | 'partial' | 'error' | 'never'
  mondayLastSyncedAt: string | null
  sheetsLastSyncedAt: string | null
  accLastSyncedAt: string | null
}

export interface ProjectRow {
  _id: string
  projectName: string
  projectNumber: string
  displayOrder?: number
  links: ProjectLinks
  accProjectId?: string
  accLinkSource?: AccLinkSource
  accExternalHub?: boolean
  // Partner-hub name (e.g. 'ANA') when the external hub is a configured client
  // account we can reach live — such projects behave like EasyBIM-hub ones.
  accHubName?: string
  // Partner-hub registry key (e.g. 'ana') — passed as ?hub= to the Autodesk
  // OAuth + project-list routes so they use the partner app's credentials.
  accHubKey?: string
  status: 'Working on it' | 'On Hold' | 'Not Started' | 'Done' | 'Stuck' | null
  milestoneProgress: number | null
  milestoneDisciplines?: MilestoneDiscipline[]
  hoursProgress: number | null
  actualHours: number | null
  budgetHours: number | null
  openIssuesCount: number | null
  accModelStatus: string | null
  bimManager?: TeamMemberPayload
  mepCoordinator?: TeamMemberPayload
  bimModeller?: TeamMemberPayload
  hoursConfig?: HoursConfig
  sync: ProjectSyncMeta
}

// A saved report draft, as shown in the project's Activity & Reports card.
export interface ReportListItem {
  _id: string
  title: string
  subject: string
  recipients: string[]
  draftId?: string
  gmailUrl?: string
  issueCount?: number
  createdByName?: string
  createdAt: string | null
  hasSnapshot?: boolean   // has issuesSnapshot → usable in the Progress comparison
}

export interface ProjectsApiResponse {
  projects: ProjectRow[]
  count: number
  asOf: string
  lastSyncedAt?: string | null
}
