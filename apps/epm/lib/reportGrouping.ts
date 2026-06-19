// Shared grouping + status helpers used by the Reports page, the Export modal,
// and the report PDF — kept in one place so colors/labels stay consistent.
import type { AccIssue } from '@/lib/services/apsService'

// ── Status colour scheme ────────────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  open:        '#FAA21B', // amber
  draft:       '#1f2937', // dark charcoal
  pending:     '#0696D7', // blue
  inProgress:  '#A3BCDC', // light blue-gray
  in_progress: '#A3BCDC',
  completed:   '#B7D78C', // green
  resolved:    '#B7D78C',
  closed:      '#DCDCDC', // light gray
}

export const STATUS_LABELS: Record<string, string> = {
  open:        'Open',
  draft:       'Draft',
  pending:     'Pending',
  inProgress:  'In Progress',
  in_progress: 'In Progress',
  completed:   'Completed',
  resolved:    'Completed',
  closed:      'Closed',
}

export function statusColor(s: string) { return STATUS_COLORS[s] ?? '#d1d5db' }
export function statusLabel(s: string) { return STATUS_LABELS[s] ?? s }

// Readable text colour for a count label sitting on a status segment.
export function segmentTextColor(s: string) {
  const hex = statusColor(s).replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#374151' : '#ffffff'
}

// ── Stack-by dimensions ──────────────────────────────────────────────────────
export const GROUP_OPTIONS = [
  { value: 'assignedTo', label: 'Assigned To' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'status',     label: 'Status' },
  { value: 'issueType',  label: 'Issue Type' },
] as const
export type GroupKey = typeof GROUP_OPTIONS[number]['value']

// Returns the group label for an issue under the chosen dimension.
export function groupValue(issue: AccIssue, groupBy: GroupKey): string {
  switch (groupBy) {
    case 'status':     return statusLabel(issue.status)
    case 'discipline': return issue.discipline?.trim() || 'No Discipline'
    case 'issueType':  return issue.issueType?.trim() || 'Other'
    case 'assignedTo':
    default:           return issue.assignedTo?.trim() || 'Unassigned'
  }
}
