// Parser for a LinkedIn page-analytics export.
//
// Deliberately dependency-free and free of any DB import, so it stays pure and
// directly testable (see analytics-import.test.mjs). Persistence lives in
// analytics.ts, which re-exports these.
//
// LinkedIn's export is a spreadsheet whose exact headers vary by tab, locale and
// year, and which carries a title + date range above the real header row. So this
// finds the header wherever it is, matches columns by name, and ignores the rest.

export interface ParsedRow {
  date: Date
  impressions?: number
  uniqueImpressions?: number
  engagements?: number
  clicks?: number
  followers?: number
  followersGained?: number
}

export type MetricField = keyof Omit<ParsedRow, 'date'>

export interface ParseResult {
  rows: ParsedRow[]
  /** Header cells we recognised, so the UI can confirm the right columns were found. */
  matched: Record<string, string>
  skipped: number
  error?: string
}

// Order matters: more specific patterns first, since a field is claimed once.
// Hebrew variants included — the page admin UI is often localized.
const HEADER_PATTERNS: { field: MetricField; patterns: RegExp[] }[] = [
  { field: 'uniqueImpressions', patterns: [/unique\s*impressions/i, /חשיפות\s*ייחודיות/] },
  { field: 'impressions', patterns: [/impressions/i, /^חשיפות/, /הופעות/] },
  { field: 'followersGained', patterns: [/new\s*followers/i, /followers\s*gained/i, /עוקבים\s*חדשים/] },
  { field: 'followers', patterns: [/total\s*followers/i, /^followers/i, /^עוקבים/] },
  { field: 'engagements', patterns: [/engagement/i, /reactions/i, /^מעורבות/, /תגובות/] },
  { field: 'clicks', patterns: [/clicks/i, /קליקים/, /הקלקות/] },
]
const DATE_PATTERNS = [/^date/i, /^day/i, /^תאריך/, /^יום/]

/** Tab-separated when pasted from a spreadsheet, comma-separated from a CSV. */
export function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === ',' && !quoted) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim().replace(/^"|"$/g, '').trim())
}

export function parseNumber(raw: string): number | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/[,\s%]/g, '')
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/**
 * ISO first (unambiguous), then D/M/Y — an Israeli export is day-first, so this
 * must never be handed to `new Date()` before the explicit patterns are tried.
 */
export function parseDateCell(raw: string): Date | null {
  if (!raw) return null
  const s = raw.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (dmy) {
    let year = Number(dmy[3])
    if (year < 100) year += 2000
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return new Date(year, month - 1, day)
  }
  // "Jul 20, 2026" and similar named-month forms.
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime()) && /[a-zA-Zא-ת]/.test(s)) {
    parsed.setHours(0, 0, 0, 0)
    return parsed
  }
  return null
}

export function parseAnalyticsExport(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { rows: [], matched: {}, skipped: 0, error: 'Nothing to import.' }

  // Header row = first line with a date-ish column AND at least one known metric.
  let headerIdx = -1
  let header: string[] = []
  let dateCol = -1
  const colMap = new Map<number, MetricField>()

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = splitLine(lines[i])
    if (cells.length < 2) continue
    const dIdx = cells.findIndex((c) => DATE_PATTERNS.some((p) => p.test(c)))
    if (dIdx === -1) continue

    const found = new Map<number, MetricField>()
    const claimed = new Set<MetricField>()
    cells.forEach((cell, idx) => {
      if (idx === dIdx || !cell) return
      for (const { field, patterns } of HEADER_PATTERNS) {
        if (claimed.has(field)) continue
        if (patterns.some((p) => p.test(cell))) {
          found.set(idx, field)
          claimed.add(field)
          return
        }
      }
    })
    if (found.size > 0) {
      headerIdx = i
      header = cells
      dateCol = dIdx
      found.forEach((f, idx) => colMap.set(idx, f))
      break
    }
  }

  if (headerIdx === -1) {
    return {
      rows: [],
      matched: {},
      skipped: 0,
      error:
        'Could not find a header row with a date column and a metric column. Paste the rows including their header (Date + Impressions / Engagements / Followers).',
    }
  }

  const rows: ParsedRow[] = []
  let skipped = 0
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    const date = parseDateCell(cells[dateCol] ?? '')
    if (!date) { skipped += 1; continue }
    const row: ParsedRow = { date }
    let any = false
    for (const [idx, field] of colMap) {
      const n = parseNumber(cells[idx] ?? '')
      if (n !== undefined) { row[field] = n; any = true }
    }
    if (!any) { skipped += 1; continue }
    rows.push(row)
  }

  const matched: Record<string, string> = { date: header[dateCol] }
  for (const [idx, field] of colMap) matched[field] = header[idx]
  return { rows, matched, skipped }
}
