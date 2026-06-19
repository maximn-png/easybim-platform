export interface TeamMemberPayload {
  name: string
  avatarUrl?: string
  profileUrl?: string
}

export interface ProjectLinks {
  mondayBoard: string
  driveFolder: string
  hoursSheet?: string
  acc?: string
}

export type AccLinkSource = 'auto' | 'manual'

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
  status: 'Working on it' | 'On Hold' | 'Not Started' | 'Done' | 'Stuck' | null
  milestoneProgress: number | null
  hoursProgress: number | null
  actualHours: number | null
  budgetHours: number | null
  openIssuesCount: number | null
  accModelStatus: string | null
  bimManager?: TeamMemberPayload
  mepCoordinator?: TeamMemberPayload
  bimModeller?: TeamMemberPayload
  sync: ProjectSyncMeta
}

export interface ProjectsApiResponse {
  projects: ProjectRow[]
  count: number
  asOf: string
  lastSyncedAt?: string | null
}
