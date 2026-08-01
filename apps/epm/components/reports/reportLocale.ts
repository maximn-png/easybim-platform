// Hebrew labels + parameter helpers shared by the Reports drawer panels.
// The generated documents and emails are Hebrew, so the export/schedule forms
// speak the same language as their output.
import type { AccIssue } from '@/lib/services/apsService'
import { groupValue } from '@/lib/reportGrouping'

export const UNASSIGNED = 'לא משויך'

// Attribute titles that mean "discipline" across ACC naming conventions.
export const DISCIPLINE_LABELS = ['discipline', 'disciplines', 'תחום', 'דיסציפלינה', 'משמעת']

// The fixed filter rows already cover these; keep them out of the "any column" picker.
export const FIXED_FILTER_KEYS = new Set(['assignedTo', 'status', 'issueType'])

// Hebrew labels for the base stack-by dimensions; custom-attribute options
// (Discipline, Level, תחום, …) show their attribute title as-is.
const GROUP_LABELS_HE: Record<string, string> = {
  assignedTo: 'משויך אל', status: 'סטטוס', issueType: 'סוג נושא', dueDate: 'תאריך יעד',
  discipline: 'דיסציפלינה', createdBy: 'נוצר על ידי',
}

export function groupLabelHe(value: string): string {
  if (GROUP_LABELS_HE[value]) return GROUP_LABELS_HE[value]
  if (value.startsWith('attr:')) {
    const title = value.slice(5)
    // Show the discipline attribute in Hebrew (the ACC title is English "Discipline").
    if (['discipline', 'disciplines'].includes(title.trim().toLowerCase())) return 'דיסציפלינה'
    return title
  }
  return value
}

export const localizeGroup = (n: string) =>
  n === 'Unassigned' ? UNASSIGNED : n === 'No Discipline' ? 'ללא דיסציפלינה' : n === 'Other' ? 'אחר' : n

// "YYYY-MM" → short Hebrew month label for the inherited month-filter chip.
export const monthLabelHe = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
}

// Value of any parameter for an issue (base dimensions, createdBy, or a custom attr:*).
export function issueParamValue(i: AccIssue, key: string): string {
  if (key === 'createdBy') return i.createdBy?.trim() || 'לא ידוע'
  return groupValue(i, key)
}
