// Analytics by Client — the health of the quoting relationship, per party.
//
// Everything here comes from the QuoteRecord index (MA-001), so it costs one
// Mongo read: how many quotes each party asked for, how many we won, how many
// they declined, how much money each outcome was worth, and — the point of the
// card — when they last asked for anything and how the recent answers have gone.
//
// A client who declined the last five quotes and hasn't asked for one in five
// months is the exact case this is meant to surface before anyone notices by
// accident.
import { connectDB } from '@/lib/db/mongoose'
import QuoteRecord from '@/lib/models/QuoteRecord'

/** Which party a group is keyed on. Every one of these is indexed per quote. */
export type PartyKey =
  | 'developer'
  | 'developerContact'
  | 'projectManagement'
  | 'projectManagerContact'
  | 'workOrderer'
  | 'workOrdererContact'

export const PARTIES: { key: PartyKey; label: string; hebrew: string }[] = [
  { key: 'developer', label: 'Client', hebrew: 'יזם ראשי' },
  { key: 'projectManagement', label: 'Project management', hebrew: 'ניהול הפרויקט' },
  { key: 'workOrderer', label: 'Work orderer', hebrew: 'מזמין העבודה' },
  { key: 'developerContact', label: 'Client contact', hebrew: 'איש קשר מטעם היזם' },
  { key: 'projectManagerContact', label: 'PM contact', hebrew: 'איש קשר מטעם מנהל פרויקט' },
  { key: 'workOrdererContact', label: 'Work orderer contact', hebrew: 'איש קשר מטעם מזמין העבודה' },
]

// ── outcome buckets ────────────────────────────────────────────────────────
// MA-001's סטאטוס labels, sorted into what they mean commercially.

export type Outcome = 'won' | 'lost' | 'open' | 'onHold'

const OUTCOME_BY_STATUS: Record<string, Outcome> = {
  Approved: 'won',
  Done: 'won',
  Declined: 'lost',
  Pending: 'open',
  'Working on it': 'open',
  'Create Quote': 'open',
  'More Info is needed': 'open',
  'Future Steps': 'open',
  'On Hold': 'onHold',
  Default: 'open',
}

export function outcomeOf(status: string | null | undefined): Outcome {
  return OUTCOME_BY_STATUS[(status ?? '').trim()] ?? 'open'
}

// ── flags ──────────────────────────────────────────────────────────────────

/** Consecutive declines at the end of the decided run. */
const LOSING_STREAK_THRESHOLD = 3
/** Months without a new quote request before a party counts as gone quiet. */
const COLD_MONTHS_THRESHOLD = 5
/** Below this many quotes there is no pattern to read into. */
const MIN_QUOTES_FOR_FLAGS = 2

export type ClientFlag = 'losingStreak' | 'coldContact' | 'allDeclined' | 'strong'

export const FLAG_META: Record<ClientFlag, { label: string; tone: 'bad' | 'warn' | 'good'; hint: string }> = {
  losingStreak: {
    label: 'Declining run',
    tone: 'bad',
    hint: `${LOSING_STREAK_THRESHOLD}+ quotes in a row declined — worth asking what changed on price or scope.`,
  },
  coldContact: {
    label: 'Gone quiet',
    tone: 'warn',
    hint: `No new quote request in ${COLD_MONTHS_THRESHOLD}+ months — reach out before the relationship cools.`,
  },
  allDeclined: {
    label: 'Never won',
    tone: 'bad',
    hint: 'Every decided quote for this party was declined — we may be mispriced for them.',
  },
  strong: {
    label: 'Strong',
    tone: 'good',
    hint: 'Above-half win rate and still asking for quotes.',
  },
}

// ── shapes ─────────────────────────────────────────────────────────────────

export interface ClientQuote {
  itemId: string
  name: string
  quoteNumber: string | null
  status: string | null
  outcome: Outcome
  price: number | null
  projectType: string | null
  usageType: string | null
  sentDate: string | null
  responseDate: string | null
  /** Days from sending to their answer — how fast this party decides. */
  responseDays: number | null
  docUrl: string | null
}

export interface ClientRow {
  party: string
  quotes: number
  sent: number
  won: number
  lost: number
  open: number
  onHold: number
  /** won ÷ (won + lost); null while nothing has been decided. */
  winRate: number | null
  valueWon: number
  valueLost: number
  valueOpen: number
  avgPrice: number | null
  firstSent: string | null
  lastSent: string | null
  lastResponse: string | null
  monthsSinceLastSent: number | null
  /** Consecutive declines at the end of the decided run (0 = last decision was a win). */
  declineStreak: number
  /** Median days between sending and their answer. */
  medianResponseDays: number | null
  flags: ClientFlag[]
  /** Quote count per calendar year — the shape of the relationship over time. */
  byYear: Record<string, number>
  quotesList: ClientQuote[]
}

export interface ClientAnalytics {
  generatedAt: string
  party: PartyKey
  partyLabel: string
  partyHebrew: string
  /** Quotes in range that have no value in this party column — they can't be grouped. */
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
  rows: ClientRow[]
  /** The rows carrying a bad/warn flag, worst first — the office manager's to-do list. */
  attention: ClientRow[]
}

// ── helpers ────────────────────────────────────────────────────────────────

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((x, y) => x - y)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function monthsSince(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  const now = new Date()
  const m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  return Math.max(0, m)
}

/** A quote's own date: when we sent it, falling back to when they answered. */
const quoteDate = (q: ClientQuote) => q.sentDate ?? q.responseDate

export interface ClientOptions {
  party?: PartyKey
  /** Only quotes sent within the last N months (undefined = all time). */
  sinceMonths?: number
  /** Drop parties with fewer than this many quotes (default 1 = keep everyone). */
  minQuotes?: number
}

export async function buildClientAnalytics(opts: ClientOptions = {}): Promise<ClientAnalytics> {
  await connectDB()
  const party = opts.party ?? 'developer'
  const meta = PARTIES.find((p) => p.key === party) ?? PARTIES[0]

  const filter: Record<string, unknown> = {}
  if (opts.sinceMonths) {
    const from = new Date()
    from.setMonth(from.getMonth() - opts.sinceMonths)
    filter.quoteSentDate = { $gte: from.toISOString().slice(0, 10) }
  }

  const recs = await QuoteRecord.find(filter)
    .select(
      'itemId name quoteNumber status price projectType usageType quoteSentDate responseDate docUrl ' +
        PARTIES.map((p) => p.key).join(' ')
    )
    .lean()

  const groups = new Map<string, ClientQuote[]>()
  let unassigned = 0

  for (const r of recs) {
    // `party` is one of the six party fields on the record; index through a
    // narrowed view rather than widening IQuoteRecord itself.
    const name = ((r as Partial<Record<PartyKey, string | null>>)[party] ?? '').trim()
    if (!name) {
      unassigned++
      continue
    }
    const sentDate = r.quoteSentDate ?? null
    const responseDate = r.responseDate ?? null
    const q: ClientQuote = {
      itemId: r.itemId,
      name: r.name,
      quoteNumber: r.quoteNumber ?? null,
      status: r.status ?? null,
      outcome: outcomeOf(r.status),
      price: r.price ?? null,
      projectType: r.projectType ?? null,
      usageType: r.usageType ?? null,
      sentDate,
      responseDate,
      responseDays: sentDate && responseDate ? daysBetween(sentDate, responseDate) : null,
      docUrl: r.docUrl ?? null,
    }
    const list = groups.get(name) ?? []
    list.push(q)
    groups.set(name, list)
  }

  const minQuotes = opts.minQuotes ?? 1
  const rows: ClientRow[] = []

  for (const [partyName, list] of groups) {
    if (list.length < minQuotes) continue
    // Newest first — the flags all read the *recent* end of the relationship.
    const sorted = [...list].sort((a, b) => (quoteDate(b) ?? '').localeCompare(quoteDate(a) ?? ''))

    const won = sorted.filter((q) => q.outcome === 'won')
    const lost = sorted.filter((q) => q.outcome === 'lost')
    const open = sorted.filter((q) => q.outcome === 'open')
    const onHold = sorted.filter((q) => q.outcome === 'onHold')
    const decided = won.length + lost.length

    // Walk the decided quotes newest-first, counting declines until the first win.
    let declineStreak = 0
    for (const q of sorted) {
      if (q.outcome === 'won') break
      if (q.outcome === 'lost') declineStreak++
    }

    const sentDates = sorted.map((q) => q.sentDate).filter((d): d is string => !!d)
    const respDates = sorted.map((q) => q.responseDate).filter((d): d is string => !!d)
    const lastSent = sentDates.length ? sentDates.reduce((a, b) => (a > b ? a : b)) : null
    const monthsIdle = monthsSince(lastSent)
    const winRate = decided ? won.length / decided : null

    const byYear: Record<string, number> = {}
    for (const q of sorted) {
      const y = (quoteDate(q) ?? '').slice(0, 4)
      if (y) byYear[y] = (byYear[y] ?? 0) + 1
    }

    const flags: ClientFlag[] = []
    if (sorted.length >= MIN_QUOTES_FOR_FLAGS) {
      if (declineStreak >= LOSING_STREAK_THRESHOLD) flags.push('losingStreak')
      if (monthsIdle != null && monthsIdle >= COLD_MONTHS_THRESHOLD) flags.push('coldContact')
      if (decided >= MIN_QUOTES_FOR_FLAGS && won.length === 0) flags.push('allDeclined')
      if (winRate != null && winRate >= 0.5 && (monthsIdle == null || monthsIdle < COLD_MONTHS_THRESHOLD)) {
        flags.push('strong')
      }
    }

    const sum = (qs: ClientQuote[]) => Math.round(qs.reduce((s, q) => s + (q.price ?? 0), 0))
    const priced = sorted.filter((q) => q.price != null)

    rows.push({
      party: partyName,
      quotes: sorted.length,
      sent: sentDates.length,
      won: won.length,
      lost: lost.length,
      open: open.length,
      onHold: onHold.length,
      winRate,
      valueWon: sum(won),
      valueLost: sum(lost),
      valueOpen: sum(open),
      avgPrice: priced.length ? Math.round(sum(priced) / priced.length) : null,
      firstSent: sentDates.length ? sentDates.reduce((a, b) => (a < b ? a : b)) : null,
      lastSent,
      lastResponse: respDates.length ? respDates.reduce((a, b) => (a > b ? a : b)) : null,
      monthsSinceLastSent: monthsIdle,
      declineStreak,
      medianResponseDays: median(sorted.map((q) => q.responseDays).filter((d): d is number => d != null)),
      flags,
      byYear,
      quotesList: sorted,
    })
  }

  rows.sort((a, b) => b.quotes - a.quotes)

  const totalWon = rows.reduce((s, r) => s + r.won, 0)
  const totalLost = rows.reduce((s, r) => s + r.lost, 0)

  // Worst first: a declining run outranks a quiet one, and more quotes at stake
  // outranks fewer.
  const severity = (r: ClientRow) =>
    (r.flags.includes('losingStreak') ? 100 : 0) +
    (r.flags.includes('allDeclined') ? 50 : 0) +
    (r.flags.includes('coldContact') ? 25 : 0) +
    Math.min(r.quotes, 20)

  return {
    generatedAt: new Date().toISOString(),
    party,
    partyLabel: meta.label,
    partyHebrew: meta.hebrew,
    unassigned,
    totals: {
      parties: rows.length,
      quotes: rows.reduce((s, r) => s + r.quotes, 0),
      won: totalWon,
      lost: totalLost,
      open: rows.reduce((s, r) => s + r.open, 0),
      winRate: totalWon + totalLost ? totalWon / (totalWon + totalLost) : null,
      valueWon: rows.reduce((s, r) => s + r.valueWon, 0),
      valueLost: rows.reduce((s, r) => s + r.valueLost, 0),
    },
    rows,
    attention: rows
      .filter((r) => r.flags.some((f) => FLAG_META[f].tone !== 'good'))
      .sort((a, b) => severity(b) - severity(a)),
  }
}
