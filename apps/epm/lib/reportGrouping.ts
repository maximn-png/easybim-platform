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

// Draft issues are never shown in any generated report (email image, PDF, Excel,
// or the analytics snapshot) — they're work-in-progress and skew the analytics.
export const isDraftIssue = (status: string) => normalizeStatus(status) === 'draft'
export const dropDraft = <T extends { status: string }>(issues: T[]): T[] =>
  issues.filter(i => !isDraftIssue(i.status))

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

// Attribute titles that mean "discipline" across ACC naming conventions (incl.
// the Hebrew "תחום" used on imported projects). Some projects carry discipline
// as a custom attribute instead of the dedicated field.
export const DISCIPLINE_ATTR_LABELS = ['discipline', 'disciplines', 'תחום', 'דיסציפלינה', 'משמעת']

// An issue's discipline: the dedicated field, else a discipline-titled attribute.
export function issueDiscipline(issue: Pick<AccIssue, 'discipline' | 'attributes'>): string | undefined {
  const direct = issue.discipline?.trim()
  if (direct) return direct
  if (issue.attributes) {
    for (const [k, v] of Object.entries(issue.attributes)) {
      if (DISCIPLINE_ATTR_LABELS.includes(k.trim().toLowerCase()) && v?.trim()) return v.trim()
    }
  }
  return undefined
}

// ── Stack-by dimensions ──────────────────────────────────────────────────────
// Static set used by the Export modal / PDF / server HTML (fixed layouts).
export const GROUP_OPTIONS = [
  { value: 'assignedTo', label: 'Assigned To' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'status',     label: 'Status' },
  { value: 'issueType',  label: 'Issue Type' },
] as const

// A plain string: the on-screen reports page builds options dynamically from the
// issues' ACC custom attributes (values like "attr:Phase"), beyond the static set.
export type GroupKey = string

export interface GroupOption { value: string; label: string }

// Dimensions always available, independent of a project's custom attributes.
const BASE_GROUP_OPTIONS: GroupOption[] = [
  { value: 'assignedTo', label: 'Assigned To' },
  { value: 'status',     label: 'Status' },
  { value: 'issueType',  label: 'Issue Type' },
  { value: 'dueDate',    label: 'Due Date' },
]

// Full stack-by list for a set of issues: base dimensions + one option per ACC
// custom attribute present (Discipline, Phase, …), each valued "attr:<Title>".
export function buildGroupOptions(issues: AccIssue[]): GroupOption[] {
  const titles = new Set<string>()
  for (const i of issues) {
    if (i.attributes) for (const k of Object.keys(i.attributes)) {
      const t = k.trim()
      if (t) titles.add(t)
    }
  }
  const attrOptions = [...titles]
    .sort((a, b) => a.localeCompare(b))
    .map(t => ({ value: `attr:${t}`, label: t }))
  return [...BASE_GROUP_OPTIONS, ...attrOptions]
}

// Resolve a display label for a group key (handles the dynamic "attr:" values).
export function groupLabelFor(groupBy: string, options: GroupOption[]): string {
  const found = options.find(o => o.value === groupBy)
  if (found) return found.label
  return groupBy.startsWith('attr:') ? groupBy.slice(5) : groupBy
}

// Canonical "YYYY-MM" bucket for an ISO timestamp. Shared by the month chart
// and the reports page's click-to-filter so both agree on which month a click hits.
export const issueMonthKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Bucket a due date relative to today, for stacking by "Due Date".
export function dueDateBucket(due: string | null | undefined): string {
  if (!due) return 'No Due Date'
  const d = new Date(due)
  if (isNaN(d.getTime())) return 'No Due Date'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((d.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return 'Overdue'
  if (diffDays <= 7) return 'Due This Week'
  if (diffDays <= 30) return 'Due This Month'
  return 'Later'
}

// Value of any filterable/groupable parameter for an issue: the base dimensions,
// Created By, or a custom "attr:*" attribute. Mirrors groupValue but adds
// createdBy (which isn't a stack-by dimension). Used by the reports page's
// "filter by any parameter" rows, matching the Export modal's behaviour.
export function paramValue(issue: AccIssue, key: string): string {
  if (key === 'createdBy') return issue.createdBy?.trim() || 'Unknown'
  return groupValue(issue, key)
}

// Returns the group label for an issue under the chosen dimension.
export function groupValue(issue: AccIssue, groupBy: string): string {
  if (groupBy === 'status')     return statusLabel(issue.status)
  if (groupBy === 'issueType')  return issue.issueType?.trim() || 'Other'
  if (groupBy === 'dueDate')    return dueDateBucket(issue.dueDate)
  if (groupBy === 'discipline') return issue.discipline?.trim() || 'No Discipline'
  if (groupBy.startsWith('attr:')) {
    const title = groupBy.slice(5)
    return issue.attributes?.[title]?.trim() || `No ${title}`
  }
  return issue.assignedTo?.trim() || 'Unassigned'
}
