// Shared grouping + status helpers used by the Reports page, the Export modal,
// and the report PDF — kept in one place so colors/labels stay consistent.
import type { AccIssue } from '@/lib/services/apsService'

// Normalise a status from any source to a canonical key. The live ACC API returns
// snake_case (e.g. "in_review"); imported "Issue summary" exports use display
// labels (e.g. "In review"). Map both to one key so colours/labels stay consistent.
export function normalizeStatus(raw: string): string {
  const k = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const aliases: Record<string, string> = {
    inprogress: 'in_progress',
    inreview: 'in_review',
    indispute: 'in_dispute',
    notapproved: 'not_approved',
    work_completed: 'completed',
    resolved: 'completed',
  }
  return aliases[k.replace(/_/g, '')] ?? aliases[k] ?? k
}

// ── Status colour scheme — matches the Autodesk ACC issue status palette ──────
export const STATUS_COLORS: Record<string, string> = {
  draft:        '#9AA5B1', // gray
  open:         '#FAA21B', // amber
  pending:      '#0696D7', // blue
  in_progress:  '#A3BCDC', // light blue-gray
  in_review:    '#8B5CF6', // purple (ACC "In review")
  answered:     '#06B6D4', // cyan
  not_approved: '#EF4444', // red
  in_dispute:   '#F97316', // orange
  completed:    '#B7D78C', // green
  closed:       '#DCDCDC', // light gray
  void:         '#9CA3AF', // gray
}

export const STATUS_LABELS: Record<string, string> = {
  draft:        'Draft',
  open:         'Open',
  pending:      'Pending',
  in_progress:  'In Progress',
  in_review:    'In Review',
  answered:     'Answered',
  not_approved: 'Not Approved',
  in_dispute:   'In Dispute',
  completed:    'Completed',
  closed:       'Closed',
  void:         'Void',
}

export function statusColor(s: string) { return STATUS_COLORS[normalizeStatus(s)] ?? '#d1d5db' }
export function statusLabel(s: string) {
  const k = normalizeStatus(s)
  return STATUS_LABELS[k] ?? String(s ?? '').trim()
}

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
