// Parses an ACC "Issue summary" export (XLSX or CSV) into the same AccIssue[]
// shape the reports page consumes from the live ACC API — so external-hub
// projects (client accounts we can't reach via the API) get an identical report.
import * as XLSX from 'xlsx'
import type { AccIssue } from '@/lib/services/apsService'

// ACC status label → the canonical key the report's color/label scheme uses
// (see lib/reportGrouping.ts). Unknown statuses pass through unchanged so they
// still display with their original text (just a neutral gray).
const STATUS_KEY: Record<string, string> = {
  'open':        'open',
  'draft':       'draft',
  'pending':     'pending',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  'completed':   'completed',
  'resolved':    'resolved',
  'closed':      'closed',
}

function normStatus(raw: string): string {
  const k = raw.trim().toLowerCase()
  return STATUS_KEY[k] ?? raw.trim()
}

// Header aliases (lower-cased) for each target field. First match in the file's
// header row wins, so column order / extra columns don't matter.
const ALIASES = {
  id:          ['id', 'issue id', '#'],
  title:       ['title'],
  status:      ['status'],
  type:        ['type', 'issue type', 'sub-type', 'subtype'],
  category:    ['category'],
  discipline:  ['discipline'],
  description: ['description'],
  assignedTo:  ['assigned to', 'assignee'],
  createdBy:   ['created by', 'creator', 'author', 'reported by', 'opened by'],
  createdAt:   ['created on', 'created at', 'created date', 'created'],
  updatedAt:   ['updated on', 'updated at'],
  closedAt:    ['closed at', 'closed on'],
  dueDate:     ['due date', 'due on', 'due', 'due date/time'],
} as const

// Headers we map to fixed AccIssue fields — every OTHER column (plus Discipline)
// becomes a generic custom attribute so the reports page can stack by it.
const CORE_HEADERS = new Set<string>([
  ...ALIASES.id, ...ALIASES.title, ...ALIASES.status, ...ALIASES.type,
  ...ALIASES.category, ...ALIASES.description, ...ALIASES.assignedTo, ...ALIASES.createdBy,
  ...ALIASES.createdAt, ...ALIASES.updatedAt, ...ALIASES.closedAt, ...ALIASES.dueDate,
])

// "root cause" → "Root Cause", "discipline" → "Discipline"
function titleCase(h: string): string {
  return h.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

const str = (v: unknown): string =>
  v == null ? '' : String(v).replace(/\s*\n\s*/g, ' ').trim()

function toIso(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString()
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v.trim())
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return ''
}

export interface ParseResult {
  issues: AccIssue[]
  total: number       // data rows seen
  sheetName: string
}

export function parseIssuesWorkbook(buf: ArrayBuffer | Buffer): ParseResult {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheetName =
    wb.SheetNames.find(n => n.toLowerCase() === 'issues') ?? wb.SheetNames[0]
  const ws = sheetName ? wb.Sheets[sheetName] : undefined
  if (!ws) return { issues: [], total: 0, sheetName: '' }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, blankrows: false, defval: '',
  }) as unknown[][]
  if (rows.length < 2) return { issues: [], total: 0, sheetName }

  const headers = (rows[0] ?? []).map(h => String(h ?? '').trim().toLowerCase())
  const idxOf = (aliases: readonly string[]) => {
    for (const a of aliases) {
      const i = headers.indexOf(a)
      if (i >= 0) return i
    }
    return -1
  }
  const ix = {
    id:          idxOf(ALIASES.id),
    title:       idxOf(ALIASES.title),
    status:      idxOf(ALIASES.status),
    type:        idxOf(ALIASES.type),
    category:    idxOf(ALIASES.category),
    discipline:  idxOf(ALIASES.discipline),
    description: idxOf(ALIASES.description),
    assignedTo:  idxOf(ALIASES.assignedTo),
    createdBy:   idxOf(ALIASES.createdBy),
    createdAt:   idxOf(ALIASES.createdAt),
    updatedAt:   idxOf(ALIASES.updatedAt),
    closedAt:    idxOf(ALIASES.closedAt),
    dueDate:     idxOf(ALIASES.dueDate),
  }

  // ACC embeds each issue's deep link as a hyperlink on the "ID" (#) cell. Map it
  // by the cell's display value so we can attach a per-issue link in our exports.
  const idLinkByValue = new Map<string, string>()
  if (ix.id >= 0 && ws['!ref']) {
    const rng = XLSX.utils.decode_range(ws['!ref'])
    for (let r = 1; r <= rng.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ix.id })] as { v?: unknown; l?: { Target?: string } } | undefined
      if (cell?.v != null && cell.l?.Target) idLinkByValue.set(String(cell.v).trim(), cell.l.Target)
    }
  }

  const issues: AccIssue[] = []
  let total = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const get = (i: number) => (i >= 0 ? row[i] : undefined)

    const title  = str(get(ix.title))
    const status = str(get(ix.status))
    // Skip rows with no meaningful content (trailing blanks etc.)
    if (!title && !status) continue
    total++

    // Every non-core column (plus Discipline) → a generic custom attribute, so the
    // reports page can stack by whatever dimensions this export happens to carry.
    const attributes: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (!h) return
      if (h === 'discipline' || !CORE_HEADERS.has(h)) {
        const val = str(row[i])
        if (val) attributes[titleCase(h)] = val
      }
    })

    const idVal = str(get(ix.id))
    issues.push({
      id:          idVal || `row-${r}`,
      displayId:   idVal.replace(/^#/, '').trim() || undefined,
      url:         (idVal && idLinkByValue.get(idVal)) || undefined,
      title:       title || '(untitled)',
      status:      normStatus(status || 'open'),
      issueType:   str(get(ix.type)) || str(get(ix.category)) || 'Other',
      discipline:  str(get(ix.discipline)),
      description: str(get(ix.description)),
      assignedTo:  str(get(ix.assignedTo)) || null,
      createdBy:   str(get(ix.createdBy)) || null,
      createdAt:   toIso(get(ix.createdAt)) || new Date(0).toISOString(),
      updatedAt:   toIso(get(ix.updatedAt)) || null,
      closedAt:    toIso(get(ix.closedAt)) || null,
      dueDate:     toIso(get(ix.dueDate)) || null,
      attributes,
    })
  }

  return { issues, total, sheetName }
}

// Open = anything not closed/completed — used for the dashboard's open-issue count.
export function openIssueCount(issues: AccIssue[]): number {
  return issues.filter(i => i.status !== 'closed' && i.status !== 'completed').length
}
