// DTO types for the My Space personal page (/me) and header panel.

export type MyRole = 'BIM Manager' | 'MEP Coordinator' | 'BIM Modeller'

export interface MyProject {
  _id: string
  projectName: string
  projectNumber: string
  roles: MyRole[]
  status: string
  actualHours: number | null
  budgetHours: number | null
  // This user's ACC issue stats on the project (matched by normalized name).
  myActiveIssues: number
  myCompletedIssues: number
  // The ACC spelling of this user's name — the issues page CREATED BY filter
  // matches this exact string (same convention as the dashboard table).
  myCreatorName?: string
  openIssuesCount: number | null
  accUrl?: string
}

export interface ProjectOption {
  _id: string
  projectName: string
  projectNumber: string
}

export interface MeOverview {
  name: string
  email: string | null
  // Monday profile photo, taken from the first matched team slot.
  avatarUrl: string | null
  // Projects where this user fills one of the three team slots.
  myProjects: MyProject[]
  // All non-done projects, for the "add row" picker in the week grid.
  allProjects: ProjectOption[]
  kpis: {
    myProjectCount: number
    myActiveIssues: number
    expectedWeeklyHours: number   // 160h/month → 40
  }
}

export interface TimeEntryDTO {
  date: string        // YYYY-MM-DD
  projectKey: string  // project _id or 'internal'
  projectName?: string
  hours: number
  subject: string     // '' = uncategorized (legacy entries)
  subtopic: string
  // Google Calendar event ids already logged into this entry.
  eventIds?: string[]
}

// The Subject → Subtopic taxonomy of the week grid (mirrors the Monday TS
// boards' Subject/Subtopic columns, trimmed to the agreed list).
export const TAXONOMY: ReadonlyArray<{ subject: string; subtopics: readonly string[] }> = [
  { subject: 'Model MGMT', subtopics: ['Meetings', 'ProjectWork'] },
  { subject: 'Superposition', subtopics: ['Meetings', 'ProjectWork'] },
  { subject: 'Modelling', subtopics: ['Meetings', 'ProjectWork'] },
  { subject: 'EasyBIM Internal', subtopics: ['Training', 'Meetings', 'R&D', 'Social', 'Management'] },
]

// Which Subject a user's meeting hours land in, by their role on the project.
export const ROLE_SUBJECT: Record<MyRole, string> = {
  'BIM Manager': 'Model MGMT',
  'MEP Coordinator': 'Superposition',
  'BIM Modeller': 'Modelling',
}

export interface AgendaMilestone {
  milestoneName: string
  billName: string
  project: string     // "22130 ארנה אשדוד"
  team: string
  date: string        // YYYY-MM-DD
  status: string
  url: string
}

export interface AgendaTask {
  name: string
  boardName: string
  date: string        // YYYY-MM-DD
  status: string | null
  overdue: boolean
  url: string
}

export interface MeAgenda {
  milestones: AgendaMilestone[]
  tasks: AgendaTask[]
  // The all-boards task sweep is slow; on a cold cache it builds in the
  // background and this flag tells the UI to say so and poll again.
  tasksBuilding: boolean
  // false = no Monday identity found for this user, so tasks can't be matched.
  mondayIdFound: boolean
}

export interface CalendarEventDTO {
  id: string
  title: string
  day: string               // YYYY-MM-DD in Asia/Jerusalem
  startTime: string | null  // 'HH:mm' local, null for all-day
  durationHours: number     // rounded to 0.25, all-day events report 0
  allDay: boolean
  // Projects recognized in the event title. Multiple matches → the meeting's
  // hours are split between them on approval.
  matches?: Array<{ projectId: string; projectName: string; projectNumber: string }>
}

export interface CalendarResponse {
  connected: boolean
  // not-connected = no Google token in Clerk; scope = token lacks calendar.readonly
  reason?: 'not-connected' | 'scope' | 'error'
  message?: string
  events?: CalendarEventDTO[]
}
