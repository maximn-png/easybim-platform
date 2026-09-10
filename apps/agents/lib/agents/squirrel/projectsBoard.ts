// MA-004-Projects_Management — the delivery side of a quote.
//
// MA-001 (Squirrel's own board) is where a job is *priced*; MA-004 is where it is
// *run*. A project carries the same סוג פרויקט / סוג שימוש / שירות taxonomy as its
// quote, plus the money the quote turned into: שכט סופי and the per-discipline
// prices. Those prices, divided by 300, are the hour banks each department was
// paid to spend — which is what makes "did Type C projects go well?" answerable.
//
// Read live from Monday (no EPM sync change), memoised briefly so a dashboard
// re-render doesn't re-walk the board. 142 items = 2 paginated queries.
import { getAllItems, MondayItem } from '@/lib/integrations/monday/client'

export const MA004_BOARD_ID = '7321609006'

export const P_COL = {
  projectNumber: 'text__1', // מס פרויקט
  location: 'text', // מקום
  stage: 'dropdown_1', // שלב
  service: 'dropdown', // שירות
  projectType: 'dropdown8', // סוג פרויקט (A / A.1 / B / C / D / E / M3)
  usageType: 'dropdown_mksxkxsg', // סוג שימוש
  status: 'status', // Status (Working on it / Not Started / On Hold / DONE)
  fee: 'numbers', // שכט סופי (₪)
  budgetHours: 'formula8', // כמות שעות (לפי 300) = שכט סופי ÷ 300
  ceilingHours: 'formula6', // שעות (לפי 225) = שכט סופי ÷ 225
  loggedHours: 'numbers8', // סהכ שעות (hand-entered on the board; we prefer TimeEntry)
  viability: 'formula1', // כדאיות (++ / + / -) — the office's own verdict
  // ── the three department price pots (₪; ÷300 → the department's hour bank) ──
  modelMgmtPrice: 'formula_mkng494f', // סה"כ מחיר ניהול מודל (retainer×months + fixed + increases)
  superpositionPrice: 'formula_mkngmc97', // סה"כ מחיר תאום מערכות (all area types + increases)
  openingsPrice: 'numeric_mkxsce4b', // מחיר מידול פתחים
  modelSetupPrice: 'numeric_mkxsjd0j', // מחיר הקמת מודל
  totalArea: 'formula_mkngcqxw', // סה"כ שטח (m²)
  // ── parties (mirrored from the linked MA-001 quote) ──
  developer: 'mirror_mknangd3', // יזם ראשי
  projectManagement: 'lookup_mkx6jpq', // ניהול הפרויקט
  workOrderer: 'lookup_mm4bpm19', // מזמין העבודה
  quoteRelation: 'board_relation', // → MA-001 item(s)
} as const

const PROJECT_COLS = Object.values(P_COL)

/** MA-004's Status labels, keyed by the label text the API returns. */
export const DONE_LABEL = 'DONE'

export interface Ma004Project {
  itemId: string
  name: string
  projectNumber: string | null
  status: string | null
  isDone: boolean
  projectType: string | null
  usageType: string | null
  service: string | null
  stage: string | null
  location: string | null
  fee: number | null
  /** שכט סופי ÷ 300 — the total hour bank. */
  budgetHours: number | null
  /** שכט סופי ÷ 225 — the break-even ceiling behind the כדאיות verdict. */
  ceilingHours: number | null
  /** The board's own hand-entered hours total (kept for cross-checking TimeEntry). */
  boardHours: number | null
  /** The board's own כדאיות verdict ("++" / "+" / "-"), for cross-checking ours. */
  boardViability: string | null
  totalArea: number | null
  developer: string | null
  projectManagement: string | null
  workOrderer: string | null
  /** MA-001 item ids this project was quoted from (joins straight to QuoteRecord). */
  quoteItemIds: string[]
  /** ₪ per department, straight off the board. */
  prices: { modelMgmt: number; superposition: number; modelling: number }
}

function cv(it: MondayItem, id: string) {
  return it.column_values.find((c) => c.id === id)
}

/** Plain text of a column, empty → null. */
function txt(it: MondayItem, id: string): string | null {
  const t = (cv(it, id)?.text ?? '').trim()
  return t && t !== 'null' ? t : null
}

/** Mirror / formula / relation columns expose their computed label via display_value. */
function disp(it: MondayItem, id: string): string | null {
  const c = cv(it, id)
  const d = (c?.display_value ?? '').trim()
  if (d && d !== 'null') return d
  const t = (c?.text ?? '').trim()
  return t && t !== 'null' ? t : null
}

function toNum(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Numeric columns read from `text`; formula columns only ever fill `display_value`. */
function num(it: MondayItem, id: string): number | null {
  return toNum(disp(it, id))
}

function toProject(it: MondayItem): Ma004Project {
  const status = txt(it, P_COL.status)
  const price = (id: string) => num(it, id) ?? 0
  return {
    itemId: it.id,
    name: it.name,
    projectNumber: txt(it, P_COL.projectNumber),
    status,
    isDone: status?.toUpperCase() === DONE_LABEL,
    projectType: txt(it, P_COL.projectType),
    usageType: txt(it, P_COL.usageType),
    service: txt(it, P_COL.service),
    stage: txt(it, P_COL.stage),
    location: txt(it, P_COL.location),
    fee: num(it, P_COL.fee),
    budgetHours: num(it, P_COL.budgetHours),
    ceilingHours: num(it, P_COL.ceilingHours),
    boardHours: num(it, P_COL.loggedHours),
    boardViability: disp(it, P_COL.viability),
    totalArea: num(it, P_COL.totalArea),
    developer: disp(it, P_COL.developer),
    projectManagement: disp(it, P_COL.projectManagement),
    workOrderer: disp(it, P_COL.workOrderer),
    quoteItemIds: cv(it, P_COL.quoteRelation)?.linked_item_ids ?? [],
    prices: {
      modelMgmt: price(P_COL.modelMgmtPrice),
      // מידול פתחים is priced separately from תאום מערכות and is its own
      // department here, so it is NOT folded into the superposition pot the way
      // EPM's two-bank hours page does it.
      superposition: price(P_COL.superpositionPrice),
      modelling: price(P_COL.openingsPrice) + price(P_COL.modelSetupPrice),
    },
  }
}

// Short-lived memo: a dashboard load asks for the board two or three times over
// (cards + tools), and the board only changes when someone edits Monday.
const CACHE_TTL_MS = 5 * 60_000
let cache: { at: number; projects: Ma004Project[] } | null = null

/** Every MA-004 project, read live from Monday. `refresh` bypasses the 5-minute memo. */
export async function listMa004Projects(refresh = false): Promise<Ma004Project[]> {
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.projects
  const items = await getAllItems(MA004_BOARD_ID, PROJECT_COLS)
  const projects = items.map(toProject)
  cache = { at: Date.now(), projects }
  return projects
}

/** The completed projects — MA-004 Status = DONE. */
export async function listCompletedProjects(refresh = false): Promise<Ma004Project[]> {
  return (await listMa004Projects(refresh)).filter((p) => p.isDone)
}
