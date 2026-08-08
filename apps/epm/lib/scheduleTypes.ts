// Wire shapes shared by the schedule APIs and the client panels.
// Kept free of server-only imports so components can type against it.

import type { Frequency } from './scheduleTime'

export type ScheduleDelivery = 'send' | 'draft'
export type ScheduleRunStatus = 'ok' | 'failed' | 'needs-auth'

export interface ScheduleFilters {
  assignees:   string[]
  issueTypes:  string[]
  disciplines: string[]
  statuses:    string[]
  extra:       { key: string; values: string[] }[]
}

export interface ScheduleRunLogDTO {
  at:          string
  status:      ScheduleRunStatus
  error?:      string
  reportId?:   string
  issueCount?: number
  recipients?: number
}

export interface ScheduleDTO {
  _id:           string
  projectId:     string
  // Only present on the cross-project listing.
  projectName?:  string
  projectNumber?: string
  name:          string
  templateId:    string
  variantId?:    string
  groupBy:       string
  filters:       ScheduleFilters
  bodyText:      string
  modelLink?:    string
  recipients:    string[]
  deliveryMode:  ScheduleDelivery
  frequency:     Frequency
  timezone:      string
  active:        boolean
  ownerUserId:   string
  ownerName?:    string
  nextRunAt:     string
  lastRunAt?:    string
  lastStatus?:   ScheduleRunStatus
  lastError?:    string
  runCount:      number
  history:       ScheduleRunLogDTO[]
}

export const EMPTY_FILTERS: ScheduleFilters = {
  assignees: [], issueTypes: [], disciplines: [], statuses: [], extra: [],
}

// A pre-filled schedule form handed from the Export tab's "תזמן את הדוח" button —
// everything except the cadence, which the user picks in the Schedule tab.
export interface ScheduleSeed {
  name:       string
  templateId: string
  variantId:  string | null
  groupBy:    string
  filters:    ScheduleFilters
  bodyText:   string
  modelLink:  string
  recipients: string[]
}
