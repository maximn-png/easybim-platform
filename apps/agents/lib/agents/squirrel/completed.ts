// Completed Projects analytics — "what actually happened on the work we finished".
//
// Three sources, joined on the project number:
//   • MA-004 (live)      — which projects are DONE, their סוג פרויקט, and the ₪ each
//                          department was paid (→ its hour bank at ₪300/hr)
//   • EPM `projects`     — the project number → _id bridge (cross-DB, same cluster)
//   • EPM `timeentries`  — the hours actually spent, by Subject
//
// The verdict is the office's own כדאיות rule from MA-004's formula1: under
// fee÷300 is profitable (++), past fee÷225 lost money (−), in between is (+).
// Applied per department against that department's own bank, and to the project
// as a whole against שכט סופי.
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db/mongoose'
import SquirrelSetting from '@/lib/models/SquirrelSetting'
import QuoteRecord from '@/lib/models/QuoteRecord'
import { listCompletedProjects } from './projectsBoard'

// EPM lives in a sibling database on the same Atlas cluster — reuse the agents
// connection and switch DBs (the pattern Peacock's Project Status already uses).
const EPM_DB = 'easybim-epm'

// ── departments ────────────────────────────────────────────────────────────

export type Department = 'modelMgmt' | 'superposition' | 'modelling' | 'none'

export const DEPARTMENTS: { key: Exclude<Department, 'none'>; label: string; hebrew: string }[] = [
  { key: 'modelMgmt', label: 'Model MGMT', hebrew: 'ניהול מודל' },
  { key: 'superposition', label: 'Superposition', hebrew: 'תאום מערכות' },
  { key: 'modelling', label: 'Modelling', hebrew: 'מידול פתחים / הקמת מודל' },
]

export const DEPARTMENT_KEYS = DEPARTMENTS.map((d) => d.key)

/**
 * Subjects whose name already is a department name map to it; everything else
 * (General, Management, R&D, Training, internal…) is not billable to a bank and
 * stays uncounted until someone assigns it on the card.
 */
const CANONICAL_SUBJECT_DEPARTMENT: Record<string, Department> = {
  'Model MGMT': 'modelMgmt',
  Superposition: 'superposition',
  Modelling: 'modelling',
}

const SUBJECT_MAP_KEY = 'subjectDepartment'

export type SubjectMap = Record<string, Department>

/** The stored office-wide overrides (empty on a fresh install). */
export async function getSubjectMap(): Promise<SubjectMap> {
  await connectDB()
  const doc = await SquirrelSetting.findOne({ key: SUBJECT_MAP_KEY }).lean()
  return (doc?.value as SubjectMap) ?? {}
}

export async function saveSubjectMap(map: SubjectMap, userId?: string): Promise<SubjectMap> {
  await connectDB()
  const clean: SubjectMap = {}
  for (const [subject, dept] of Object.entries(map)) {
    if (dept === 'modelMgmt' || dept === 'superposition' || dept === 'modelling' || dept === 'none') {
      clean[subject] = dept
    }
  }
  await SquirrelSetting.updateOne(
    { key: SUBJECT_MAP_KEY },
    { $set: { value: clean, updatedBy: userId ?? null } },
    { upsert: true }
  )
  return clean
}

/** Effective department for a Subject: stored override, else canonical, else uncounted. */
export function departmentFor(subject: string, map: SubjectMap): Department {
  return map[subject] ?? CANONICAL_SUBJECT_DEPARTMENT[subject] ?? 'none'
}

// ── the כדאיות verdict ─────────────────────────────────────────────────────

export type Verdict = 'good' | 'ok' | 'over' | 'unknown'

/** MA-004's own divisors: ₪300/hr is the target rate, ₪225/hr the break-even floor. */
const TARGET_RATE = 300
const BREAK_EVEN_RATE = 225
/** bank(@300) × this = the same money's hours at ₪225 — the ceiling. */
const CEILING_FACTOR = TARGET_RATE / BREAK_EVEN_RATE // 1.333…

export interface Verdicted {
  spent: number
  bank: number | null
  /** spent ÷ bank as a percent (null when there is no bank to measure against). */
  pct: number | null
  verdict: Verdict
}

/**
 * The office rule, straight from MA-004's `כדאיות` formula:
 *   actual < fee/300  → "++"  we beat the rate we priced at
 *   actual > fee/225  → "−"   we went past break-even
 *   otherwise         → "+"   acceptable
 *
 * `measured` is the guard that keeps this honest: a project with no timesheet at
 * all reads as zero hours, and zero hours against any bank would score as our
 * most profitable job ever. No hours means no verdict, not a good one.
 */
export function judge(spent: number, bank: number | null, measured = true): Verdicted {
  if (bank == null || bank <= 0 || !measured) {
    return { spent, bank: bank && bank > 0 ? bank : null, pct: null, verdict: 'unknown' }
  }
  const pct = Math.round((spent / bank) * 100)
  const verdict: Verdict = spent < bank ? 'good' : spent > bank * CEILING_FACTOR ? 'over' : 'ok'
  return { spent, bank, pct, verdict }
}

export const VERDICT_META: Record<Verdict, { label: string; badge: string; color: string }> = {
  good: { label: 'Profitable', badge: '++', color: '#10b981' },
  ok: { label: 'Acceptable', badge: '+', color: '#f59e0b' },
  over: { label: 'Over break-even', badge: '−', color: '#ef4444' },
  unknown: { label: 'No budget on board', badge: '?', color: '#9ca3af' },
}

// ── per-project rollup ─────────────────────────────────────────────────────

export interface DepartmentResult extends Verdicted {
  key: Exclude<Department, 'none'>
  label: string
  /** ₪ this department was paid on MA-004. */
  price: number
}

export interface CompletedProject {
  itemId: string
  projectNumber: string | null
  name: string
  projectType: string
  usageType: string | null
  service: string | null
  location: string | null
  fee: number | null
  totalArea: number | null
  /** MA-004's own ++ / + / − , so a disagreement with ours is visible rather than silent. */
  boardViability: string | null
  /** The board's hand-entered סהכ שעות — what formula1 judged, vs our timesheet total. */
  boardHours: number | null
  /** True when MA-004's own verdict and ours differ (its hours column is hand-kept). */
  disagreesWithBoard: boolean
  /** Whole-project figures against שכט סופי ÷ 300. */
  total: Verdicted
  departments: DepartmentResult[]
  /** false = the board carries no per-department prices, so the split below has no banks. */
  hasDepartmentPricing: boolean
  /** Bank hours in שכט סופי that no department price accounts for. */
  unallocatedBank: number | null
  /** Hours on Subjects nobody assigned to a department — excluded from every bank. */
  uncountedHours: number
  uncountedSubjects: string[]
  hoursBySubject: Record<string, number>
  /** Calendar span of the logged hours — how long the job actually ran. */
  firstEntry: string | null
  lastEntry: string | null
  months: number | null
  /** false = no matching EPM project, so we have no timesheet for it. */
  hasHours: boolean
  /** The quote this project came from (MA-004 → MA-001 relation). */
  quote: { itemId: string; quoteNumber: string | null; price: number | null; client: string | null } | null
  mondayUrl: string
}

export interface TypeGroup {
  projectType: string
  projects: number
  /** Projects that have both a bank and logged hours — the ones the numbers speak for. */
  measured: number
  totalFee: number
  /** Bank and spent hours over the MEASURED projects only, so the ratio is comparable. */
  totalBankHours: number
  totalSpentHours: number
  pct: number | null
  verdict: Verdict
  verdictCounts: Record<Verdict, number>
  departments: {
    key: Exclude<Department, 'none'>
    label: string
    bank: number
    spent: number
    pct: number | null
    verdict: Verdict
    /** Measured projects in this type that actually carry a price for this department. */
    priced: number
    /** Hours worked for this department on projects with no price for it. */
    spentUnpriced: number
  }[]
  avgMonths: number | null
}

export interface CompletedAnalytics {
  generatedAt: string
  totals: {
    /** Every MA-004 item with Status = DONE. */
    projects: number
    /** …of which we have a timesheet AND a budget for — the ones the verdicts cover. */
    measured: number
    fee: number
    bankHours: number
    spentHours: number
    pct: number | null
    verdict: Verdict
    verdictCounts: Record<Verdict, number>
    uncountedHours: number
  }
  byType: TypeGroup[]
  byDepartment: {
    key: Exclude<Department, 'none'>
    label: string
    hebrew: string
    bank: number
    spent: number
    pct: number | null
    verdict: Verdict
    priced: number
  }[]
  projects: CompletedProject[]
  /** Every Subject seen on these projects + its effective department, for the mapping panel. */
  subjects: { subject: string; department: Department; hours: number }[]
  /** DONE projects with no EPM twin — their hours can't be counted. Surfaced, not hidden. */
  missingHours: { projectNumber: string | null; name: string }[]
}

const emptyVerdictCounts = (): Record<Verdict, number> => ({ good: 0, ok: 0, over: 0, unknown: 0 })

const round1 = (n: number) => Math.round(n * 10) / 10

/** Hours per Subject for a set of EPM project ids, plus the span they were logged over. */
async function hoursByProject(projectIds: mongoose.Types.ObjectId[]) {
  const epm = mongoose.connection.useDb(EPM_DB, { useCache: true })
  const rows = (await epm
    .collection('timeentries')
    .aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: { projectId: '$projectId', subject: '$subject' },
          hours: { $sum: '$hours' },
          first: { $min: '$date' },
          last: { $max: '$date' },
        },
      },
    ])
    .toArray()) as { _id: { projectId: mongoose.Types.ObjectId; subject: string }; hours: number; first: string; last: string }[]

  const out = new Map<string, { bySubject: Record<string, number>; first: string | null; last: string | null }>()
  for (const r of rows) {
    const key = String(r._id.projectId)
    const entry = out.get(key) ?? { bySubject: {}, first: null, last: null }
    const subject = (r._id.subject ?? '').trim() || 'General'
    entry.bySubject[subject] = round1((entry.bySubject[subject] ?? 0) + r.hours)
    if (!entry.first || r.first < entry.first) entry.first = r.first
    if (!entry.last || r.last > entry.last) entry.last = r.last
    out.set(key, entry)
  }
  return out
}

/** Whole months between two YYYY-MM-DD dates, minimum 1. */
function monthsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from)
  const b = new Date(to)
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
  return m > 0 ? m : 1
}

const UNTYPED = 'Untyped'

/**
 * Roll a department up over a set of projects. Only projects that carry a price
 * for that department contribute — most non-C projects have שכט סופי filled but
 * no per-discipline breakdown, and folding their hours in against a zero bank
 * would read as a wild overspend that is really just a blank column.
 */
function rollupDepartment(d: (typeof DEPARTMENTS)[number], rows: CompletedProject[]) {
  const all = rows.map((r) => r.departments.find((x) => x.key === d.key)).filter((x): x is DepartmentResult => !!x)
  const priced = all.filter((x) => x.bank != null)
  const bank = round1(priced.reduce((s, x) => s + (x.bank ?? 0), 0))
  const spent = round1(priced.reduce((s, x) => s + x.spent, 0))
  const j = judge(spent, bank || null, priced.length > 0)
  return {
    key: d.key,
    label: d.label,
    bank,
    spent,
    pct: j.pct,
    verdict: j.verdict,
    priced: priced.length,
    // Hours this department worked on projects that carry no price for it. Real
    // work, no bank to judge it against — reported rather than dropped, so the
    // department's spend column never reads lower than what people actually did.
    spentUnpriced: round1(all.reduce((s, x) => s + x.spent, 0) - spent),
  }
}

export interface CompletedOptions {
  /** Bypass the 5-minute MA-004 memo. */
  refresh?: boolean
  /** Only these סוג פרויקט values (e.g. ['C']). */
  projectTypes?: string[]
}

export async function buildCompletedAnalytics(opts: CompletedOptions = {}): Promise<CompletedAnalytics> {
  await connectDB()
  const [board, subjectMap] = await Promise.all([listCompletedProjects(opts.refresh), getSubjectMap()])

  const done = opts.projectTypes?.length
    ? board.filter((p) => opts.projectTypes!.includes(p.projectType ?? UNTYPED))
    : board

  // MA-004 project number → EPM project _id (the only bridge to the timesheet).
  const epm = mongoose.connection.useDb(EPM_DB, { useCache: true })
  const numbers = done.map((p) => p.projectNumber).filter((n): n is string => !!n)
  const epmDocs = (await epm
    .collection('projects')
    .find({ projectNumber: { $in: numbers } }, { projection: { projectNumber: 1 } })
    .toArray()) as { _id: mongoose.Types.ObjectId; projectNumber: string }[]
  const idByNumber = new Map(epmDocs.map((d) => [String(d.projectNumber), d._id]))

  const hours = await hoursByProject(epmDocs.map((d) => d._id))

  // The originating quotes, for the "quoted vs delivered" column.
  const quoteIds = done.flatMap((p) => p.quoteItemIds)
  const quotes = quoteIds.length
    ? await QuoteRecord.find({ itemId: { $in: quoteIds } })
        .select('itemId quoteNumber price client developer')
        .lean()
    : []
  const quoteById = new Map(quotes.map((q) => [q.itemId, q]))

  const projects: CompletedProject[] = []
  const missingHours: CompletedAnalytics['missingHours'] = []
  const subjectHours: Record<string, number> = {}

  for (const p of done) {
    const epmId = p.projectNumber ? idByNumber.get(p.projectNumber) : undefined
    const logged = epmId ? hours.get(String(epmId)) : undefined
    if (!logged) missingHours.push({ projectNumber: p.projectNumber, name: p.name })

    const bySubject = logged?.bySubject ?? {}
    for (const [s, h] of Object.entries(bySubject)) subjectHours[s] = round1((subjectHours[s] ?? 0) + h)

    // Spread the hours over the departments.
    const spent: Record<Department, number> = { modelMgmt: 0, superposition: 0, modelling: 0, none: 0 }
    const uncountedSubjects: string[] = []
    for (const [subject, h] of Object.entries(bySubject)) {
      const dept = departmentFor(subject, subjectMap)
      spent[dept] += h
      if (dept === 'none') uncountedSubjects.push(subject)
    }

    const totalSpent = round1(spent.modelMgmt + spent.superposition + spent.modelling + spent.none)
    const measured = !!logged
    const departments: DepartmentResult[] = DEPARTMENTS.map((d) => {
      const price = p.prices[d.key]
      const bank = price > 0 ? round1(price / TARGET_RATE) : null
      return { key: d.key, label: d.label, price, ...judge(round1(spent[d.key]), bank, measured) }
    })

    const total = judge(totalSpent, p.budgetHours, measured)
    // The board's own verdict runs off a hand-entered hours column, so it drifts.
    // Showing the disagreement is more useful than silently overriding it.
    const ourBadge = total.verdict === 'unknown' ? null : VERDICT_META[total.verdict].badge
    const departmentBank = departments.reduce((s, d) => s + (d.bank ?? 0), 0)

    projects.push({
      itemId: p.itemId,
      projectNumber: p.projectNumber,
      name: p.name,
      projectType: p.projectType ?? UNTYPED,
      usageType: p.usageType,
      service: p.service,
      location: p.location,
      fee: p.fee,
      totalArea: p.totalArea,
      boardViability: p.boardViability,
      boardHours: p.boardHours,
      disagreesWithBoard: !!ourBadge && !!p.boardViability && p.boardViability.trim() !== ourBadge,
      total,
      departments,
      hasDepartmentPricing: departmentBank > 0,
      unallocatedBank:
        p.budgetHours && departmentBank > 0 ? round1(Math.max(0, p.budgetHours - departmentBank)) : null,
      uncountedHours: round1(spent.none),
      uncountedSubjects,
      hoursBySubject: bySubject,
      firstEntry: logged?.first ?? null,
      lastEntry: logged?.last ?? null,
      months: monthsBetween(logged?.first ?? null, logged?.last ?? null),
      hasHours: !!logged,
      quote: (() => {
        const q = p.quoteItemIds.map((id) => quoteById.get(id)).find(Boolean)
        return q
          ? {
              itemId: q.itemId,
              quoteNumber: q.quoteNumber ?? null,
              price: q.price ?? null,
              client: q.developer ?? q.client ?? null,
            }
          : null
      })(),
      mondayUrl: `https://easybim-company.monday.com/boards/${'7321609006'}/pulses/${p.itemId}`,
    })
  }

  // ── group by סוג פרויקט ──
  const typeKeys = [...new Set(projects.map((p) => p.projectType))].sort()
  const byType: TypeGroup[] = typeKeys.map((t) => {
    const rows = projects.filter((p) => p.projectType === t)
    const verdictCounts = emptyVerdictCounts()
    for (const r of rows) verdictCounts[r.total.verdict]++

    // Only projects we can actually judge feed the ratio — mixing an unmeasured
    // project's bank in with nobody's hours would flatter every group it lands in.
    const measured = rows.filter((r) => r.total.verdict !== 'unknown')
    const totalBankHours = round1(measured.reduce((s, r) => s + (r.total.bank ?? 0), 0))
    const totalSpentHours = round1(measured.reduce((s, r) => s + r.total.spent, 0))
    const j = judge(totalSpentHours, totalBankHours || null, measured.length > 0)
    const spanMonths = measured.map((r) => r.months).filter((m): m is number => m != null)

    return {
      projectType: t,
      projects: rows.length,
      measured: measured.length,
      totalFee: rows.reduce((s, r) => s + (r.fee ?? 0), 0),
      totalBankHours,
      totalSpentHours,
      pct: j.pct,
      verdict: j.verdict,
      verdictCounts,
      departments: DEPARTMENTS.map((d) => rollupDepartment(d, measured)),
      avgMonths: spanMonths.length ? Math.round((spanMonths.reduce((s, m) => s + m, 0) / spanMonths.length) * 10) / 10 : null,
    }
  })

  const totalsVerdictCounts = emptyVerdictCounts()
  for (const p of projects) totalsVerdictCounts[p.total.verdict]++
  const measuredProjects = projects.filter((p) => p.total.verdict !== 'unknown')
  const bankHours = round1(measuredProjects.reduce((s, p) => s + (p.total.bank ?? 0), 0))
  const spentHours = round1(measuredProjects.reduce((s, p) => s + p.total.spent, 0))
  const overall = judge(spentHours, bankHours || null, measuredProjects.length > 0)

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      projects: projects.length,
      measured: measuredProjects.length,
      fee: projects.reduce((s, p) => s + (p.fee ?? 0), 0),
      bankHours,
      spentHours,
      pct: overall.pct,
      verdict: overall.verdict,
      verdictCounts: totalsVerdictCounts,
      uncountedHours: round1(projects.reduce((s, p) => s + p.uncountedHours, 0)),
    },
    byType,
    byDepartment: DEPARTMENTS.map((d) => ({ hebrew: d.hebrew, ...rollupDepartment(d, measuredProjects) })),
    projects: projects.sort((a, b) => (b.total.pct ?? -1) - (a.total.pct ?? -1)),
    subjects: Object.entries(subjectHours)
      .map(([subject, hrs]) => ({ subject, department: departmentFor(subject, subjectMap), hours: hrs }))
      .sort((a, b) => b.hours - a.hours),
    missingHours,
  }
}
