// Squirrel's quote index: sync Monday columns + sheet-derived area into
// QuoteRecord so the chat can filter/aggregate/compare quotes fast.
import { connectDB } from '@/lib/db/mongoose'
import QuoteRecord from '@/lib/models/QuoteRecord'
import * as g from '@/lib/integrations/google/client'
import { getAllItems, MondayItem } from '@/lib/integrations/monday/client'
import { BOARD_ID, COL, disp } from './board'

const INDEX_COLS = [
  COL.quoteNumber,
  COL.developer,
  COL.developerContact,
  COL.projectManagement,
  COL.projectManagerContact,
  COL.workOrderer,
  COL.workOrdererContact,
  COL.location,
  COL.service,
  COL.projectType,
  COL.usageType,
  COL.stage,
  COL.price,
  COL.status,
  COL.owner,
  COL.quoteSentDate,
  COL.responseDate,
  COL.sheetLink,
  COL.docLink,
  COL.gdriveLink,
]

function cv(item: MondayItem, id: string) {
  return item.column_values.find((c) => c.id === id)
}
function txt(item: MondayItem, id: string): string | null {
  const t = cv(item, id)?.text
  return t && t.trim() ? t.trim() : null
}
function toNumber(s: string | null | undefined): number | null {
  if (s == null || s === '') return null
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
function num(item: MondayItem, id: string): number | null {
  return toNumber(txt(item, id))
}
function linkUrl(item: MondayItem, id: string): string | null {
  const c = cv(item, id)
  if (!c) return null
  if (c.value) {
    try {
      const j = JSON.parse(c.value) as { url?: string }
      if (j?.url) return j.url
    } catch {
      /* not JSON — fall through */
    }
  }
  return c.text && c.text.trim() ? c.text.trim() : null
}

export interface SyncResult {
  total: number
  upserts: number
}

/** Map a Monday item to the QuoteRecord fields derived from its columns (excludes areaSqm). */
function mondayFields(it: MondayItem) {
  const sheetUrl = linkUrl(it, COL.sheetLink)
  return {
    name: it.name,
    quoteNumber: txt(it, COL.quoteNumber),
    client: disp(it, COL.developer),
    developer: disp(it, COL.developer),
    developerContact: disp(it, COL.developerContact),
    projectManagement: disp(it, COL.projectManagement),
    projectManagerContact: disp(it, COL.projectManagerContact),
    workOrderer: disp(it, COL.workOrderer),
    workOrdererContact: disp(it, COL.workOrdererContact),
    location: txt(it, COL.location),
    service: txt(it, COL.service),
    projectType: txt(it, COL.projectType),
    usageType: txt(it, COL.usageType),
    stage: txt(it, COL.stage),
    price: num(it, COL.price),
    status: txt(it, COL.status),
    owner: txt(it, COL.owner),
    quoteSentDate: txt(it, COL.quoteSentDate),
    responseDate: txt(it, COL.responseDate),
    sheetUrl,
    docUrl: linkUrl(it, COL.docLink),
    driveFolderUrl: linkUrl(it, COL.gdriveLink),
    sheetId: sheetUrl ? g.parseSheetId(sheetUrl) : null,
    lastSyncedAt: new Date(),
  }
}

/** Pull every board item and upsert its Monday-derived fields in one bulkWrite (does not touch areaSqm). */
export async function syncFromMonday(): Promise<SyncResult> {
  await connectDB()
  const items = await getAllItems(BOARD_ID, INDEX_COLS)
  if (items.length === 0) return { total: 0, upserts: 0 }
  const ops = items.map((it) => ({
    updateOne: {
      filter: { itemId: it.id },
      update: { $set: mondayFields(it) },
      upsert: true,
    },
  }))
  const res = await QuoteRecord.bulkWrite(ops, { ordered: false })
  return { total: items.length, upserts: (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0) }
}

/** Upsert a single item's record (used by the setup pass so a new project is instantly queryable). */
export async function upsertOne(itemId: string): Promise<void> {
  await connectDB()
  const items = await getAllItems(BOARD_ID, INDEX_COLS).catch(() => [] as MondayItem[])
  const it = items.find((x) => x.id === itemId)
  if (!it) return
  await QuoteRecord.updateOne({ itemId }, { $set: mondayFields(it) }, { upsert: true })
}

// Tabs (in priority order) and label used to locate the total project area.
const AREA_TABS = ['ToQuote', 'WorkingSheet']
const AREA_LABEL = 'שטח'

/** Read the total project area (m²) from a work-plan sheet, anchored on the "שטח" label. */
export async function extractArea(sheetId: string): Promise<number | null> {
  for (const tab of AREA_TABS) {
    let vals: string[][]
    try {
      vals = await g.getSheetValues(sheetId, `'${tab}'`)
    } catch {
      continue // tab may not exist in this sheet
    }
    for (let ri = 0; ri < vals.length; ri++) {
      const row = vals[ri] ?? []
      for (let ci = 0; ci < row.length; ci++) {
        if (!String(row[ci] ?? '').includes(AREA_LABEL)) continue
        // value directly below the label, else to its right
        const below = toNumber(vals[ri + 1]?.[ci])
        if (below != null && below > 0) return below
        const right = toNumber(row[ci + 1])
        if (right != null && right > 0) return right
      }
    }
  }
  return null
}

// Tabs that hold the quote detail (line items, rates, area, price-per-m²).
export const DETAIL_TABS = ['WorkingSheet', 'ToQuote', 'Prices']

/** Read a quote sheet's detail tabs as trimmed value grids (for on-demand deep reads). */
export async function readSheetTabs(
  sheetId: string,
  tabs: string[] = DETAIL_TABS
): Promise<Record<string, string[][]>> {
  const out: Record<string, string[][]> = {}
  const titles = await g.getSheetTitles(sheetId).catch(() => [] as string[])
  for (const tab of tabs) {
    if (!titles.includes(tab)) continue
    let vals: string[][]
    try {
      vals = await g.getSheetValues(sheetId, `'${tab}'`)
    } catch {
      continue
    }
    // Drop trailing empty cells per row, then trailing empty rows.
    const trimmed = vals.map((row) => {
      let last = row.length
      while (last > 0 && String(row[last - 1] ?? '').trim() === '') last--
      return row.slice(0, last)
    })
    while (trimmed.length && trimmed[trimmed.length - 1].length === 0) trimmed.pop()
    out[tab] = trimmed
  }
  return out
}

export interface AreaBackfillResult {
  scanned: number
  updated: number
  failed: number
}

/**
 * Fill areaSqm for records that have a sheet but no area yet (or all, if force).
 * Capped per run so the daily cron stays under maxDuration; converges over runs.
 */
export async function backfillAreas(limit = 40, force = false): Promise<AreaBackfillResult> {
  await connectDB()
  const filter = force
    ? { sheetId: { $nin: [null, ''] } }
    : { sheetId: { $nin: [null, ''] }, $or: [{ areaSqm: null }, { areaSqm: { $exists: false } }] }
  const recs = await QuoteRecord.find(filter).limit(limit).lean()
  let updated = 0
  let failed = 0
  for (const r of recs) {
    try {
      const area = await extractArea(r.sheetId as string)
      await QuoteRecord.updateOne({ itemId: r.itemId }, { $set: { areaSqm: area, areaSyncedAt: new Date() } })
      if (area != null) updated++
    } catch (e) {
      failed++
      console.error(`[squirrel] area extract failed for ${r.itemId}:`, (e as Error).message)
    }
  }
  return { scanned: recs.length, updated, failed }
}
