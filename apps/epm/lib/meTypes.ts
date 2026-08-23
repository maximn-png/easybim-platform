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
  // Google Calendar event ids already logged into this cell.
  eventIds?: string[]
}

export interface CalendarEventDTO {
  id: string
  title: string
  day: string               // YYYY-MM-DD in Asia/Jerusalem
  startTime: string | null  // 'HH:mm' local, null for all-day
  durationHours: number     // rounded to 0.25, all-day events report 0
  allDay: boolean
}

export interface CalendarResponse {
  connected: boolean
  // not-connected = no Google token in Clerk; scope = token lacks calendar.readonly
  reason?: 'not-connected' | 'scope' | 'error'
  message?: string
  events?: CalendarEventDTO[]
}
