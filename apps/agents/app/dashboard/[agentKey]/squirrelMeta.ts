// Client-safe mirrors of the Squirrel analytics shapes + the palettes the two
// cards draw with. The lib/ modules can't be imported into a client bundle
// (they pull in mongoose), so the DTOs live here alongside the colours.

// ── palettes ───────────────────────────────────────────────────────────────
// Both sets are validated against the dataviz six checks on the card surface
// (see scripts/validate_palette.js). Every mark drawn in them also carries a
// visible number or label, which is what relieves the sub-3:1 contrast warning
// on the lighter steps — so never drop the labels to "clean up" a chart.

/** Departments: categorical identity, fixed order, never cycled. */
export const DEPT_COLOR: Record<string, string> = {
  modelMgmt: '#4f5bd5',
  superposition: '#44b8d3',
  modelling: '#f59e0b',
}

/** Verdicts are a STATUS palette — reserved, always shipped with their badge. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  good: '#10b981',
  ok: '#f59e0b',
  over: '#ef4444',
  unknown: '#9ca3af',
}

export const VERDICT_LABEL: Record<Verdict, { label: string; badge: string; hint: string }> = {
  good: { label: 'Profitable', badge: '++', hint: 'Spent less than שכ״ט ÷ 300 — we beat the rate we priced at.' },
  ok: { label: 'Acceptable', badge: '+', hint: 'Between שכ״ט ÷ 300 and שכ״ט ÷ 225 — inside break-even.' },
  over: { label: 'Over break-even', badge: '−', hint: 'Past שכ״ט ÷ 225 — this one cost more than it earned.' },
  unknown: { label: 'Not measurable', badge: '?', hint: 'No budget on the board, or no hours logged against it.' },
}

/** Quote outcomes — also status, also always labelled. */
export const OUTCOME_COLOR: Record<string, string> = {
  won: '#10b981',
  lost: '#ef4444',
  open: '#f59e0b',
  onHold: '#9ca3af',
}

export const FLAG_TONE_COLOR: Record<'bad' | 'warn' | 'good', string> = {
  bad: '#ef4444',
  warn: '#f59e0b',
  good: '#10b981',
}

// ── completed projects ─────────────────────────────────────────────────────

export type Verdict = 'good' | 'ok' | 'over' | 'unknown'
export type Department = 'modelMgmt' | 'superposition' | 'modelling' | 'none'

export interface Verdicted {
  spent: number
  bank: number | null
  pct: number | null
  verdict: Verdict
}

export interface DepartmentResultDTO extends Verdicted {
  key: Exclude<Department, 'none'>
  label: string
  price: number
}

export interface CompletedProjectDTO {
  itemId: string
  projectNumber: string | null
  name: string
  projectType: string
  usageType: string | null
  service: string | null
  location: string | null
  fee: number | null
  totalArea: number | null
  boardViability: string | null
  boardHours: number | null
  disagreesWithBoard: boolean
  total: Verdicted
  departments: DepartmentResultDTO[]
  hasDepartmentPricing: boolean
  unallocatedBank: number | null
  uncountedHours: number
  uncountedSubjects: string[]
  hoursBySubject: Record<string, number>
  firstEntry: string | null
  lastEntry: string | null
  months: number | null
  hasHours: boolean
  quote: { itemId: string; quoteNumber: string | null; price: number | null; client: string | null } | null
  mondayUrl: string
}

export interface DeptRollupDTO {
  key: Exclude<Department, 'none'>
  label: string
  bank: number
  spent: number
  pct: number | null
  verdict: Verdict
  priced: number
  /** Hours this department worked on projects that carry no price for it. */
  spentUnpriced: number
}

export interface TypeGroupDTO {
  projectType: string
  projects: number
  measured: number
  totalFee: number
  totalBankHours: number
  totalSpentHours: number
  pct: number | null
  verdict: Verdict
  verdictCounts: Record<Verdict, number>
  departments: DeptRollupDTO[]
  avgMonths: number | null
}

export interface CompletedDTO {
  generatedAt: string
  totals: {
    projects: number
    measured: number
    fee: number
    bankHours: number
    spentHours: number
    pct: number | null
    verdict: Verdict
    verdictCounts: Record<Verdict, number>
    uncountedHours: number
  }
  byType: TypeGroupDTO[]
  byDepartment: (DeptRollupDTO & { hebrew: string })[]
  projects: CompletedProjectDTO[]
  subjects: { subject: string; department: Department; hours: number }[]
  missingHours: { projectNumber: string | null; name: string }[]
}

// ── clients ────────────────────────────────────────────────────────────────

export type PartyKey =
  | 'developer'
  | 'developerContact'
  | 'projectManagement'
  | 'projectManagerContact'
  | 'workOrderer'
  | 'workOrdererContact'

export const PARTY_OPTIONS: { key: PartyKey; label: string; hebrew: string }[] = [
  { key: 'developer', label: 'Client', hebrew: 'יזם ראשי' },
  { key: 'projectManagement', label: 'Project management', hebrew: 'ניהול הפרויקט' },
  { key: 'workOrderer', label: 'Work orderer', hebrew: 'מזמין העבודה' },
  { key: 'developerContact', label: 'Client contact', hebrew: 'איש קשר מטעם היזם' },
  { key: 'projectManagerContact', label: 'PM contact', hebrew: 'איש קשר מנהל פרויקט' },
  { key: 'workOrdererContact', label: 'Orderer contact', hebrew: 'איש קשר מזמין העבודה' },
]

export type ClientFlag = 'losingStreak' | 'coldContact' | 'allDeclined' | 'strong'

export const FLAG_LABEL: Record<ClientFlag, { label: string; tone: 'bad' | 'warn' | 'good'; hint: string }> = {
  losingStreak: { label: 'Declining run', tone: 'bad', hint: '3+ quotes in a row declined — worth asking what changed on price or scope.' },
  coldContact: { label: 'Gone quiet', tone: 'warn', hint: 'No new quote request in 5+ months — reach out before the relationship cools.' },
  allDeclined: { label: 'Never won', tone: 'bad', hint: 'Every decided quote was declined — we may be mispriced for them.' },
  strong: { label: 'Strong', tone: 'good', hint: 'Above-half win rate and still asking for quotes.' },
}

export interface ClientQuoteDTO {
  itemId: string
  name: string
  quoteNumber: string | null
  status: string | null
  outcome: 'won' | 'lost' | 'open' | 'onHold'
  price: number | null
  projectType: string | null
  usageType: string | null
  sentDate: string | null
  responseDate: string | null
  responseDays: number | null
  docUrl: string | null
}

export interface ClientRowDTO {
  party: string
  quotes: number
  sent: number
  won: number
  lost: number
  open: number
  onHold: number
  winRate: number | null
  valueWon: number
  valueLost: number
  valueOpen: number
  avgPrice: number | null
  firstSent: string | null
  lastSent: string | null
  lastResponse: string | null
  monthsSinceLastSent: number | null
  declineStreak: number
  medianResponseDays: number | null
  flags: ClientFlag[]
  byYear: Record<string, number>
  quotesList: ClientQuoteDTO[]
}

export interface ClientsDTO {
  generatedAt: string
  party: PartyKey
  partyLabel: string
  partyHebrew: string
  unassigned: number
  totals: {
    parties: number
    quotes: number
    won: number
    lost: number
    open: number
    winRate: number | null
    valueWon: number
    valueLost: number
  }
  rows: ClientRowDTO[]
  attention: ClientRowDTO[]
}

// ── formatting ─────────────────────────────────────────────────────────────

export const hrs = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n).toLocaleString()}h`

export const pctText = (n: number | null | undefined) => (n == null ? '—' : `${n}%`)

/** ₪ with a k/M suffix — these are six- and seven-figure numbers in a narrow cell. */
export function shekel(n: number | null | undefined): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `₪${Math.round(n / 1_000)}k`
  return `₪${Math.round(n)}`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

/** "3 mo" / "1 yr 2 mo" — the idle gap reads better than a raw month count. */
export function fmtMonths(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m < 12) return `${m} mo`
  const y = Math.floor(m / 12)
  const rest = m % 12
  return rest ? `${y}y ${rest}m` : `${y}y`
}
