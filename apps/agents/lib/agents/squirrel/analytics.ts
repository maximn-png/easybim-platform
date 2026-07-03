import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import QuoteRecord from '@/lib/models/QuoteRecord'
import { syncFromMonday, backfillAreas, readSheetTabs } from './quoteIndex'
import { readQuoteItem } from './board'
import { parseSheetId, parseDocId, getDocTables } from '@/lib/integrations/google/client'

// Case-insensitive contains match (client/project names vary in spelling/casing).
function rx(s: string) {
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}

const filtersSchema = z.object({
  client: z.string().optional().describe('client (= developer / יזם ראשי) name, contains match'),
  developer: z.string().optional().describe('יזם ראשי (same as client)'),
  developerContact: z.string().optional().describe('איש קשר מטעם היזם'),
  projectManagement: z.string().optional().describe('ניהול הפרויקט'),
  projectManagerContact: z.string().optional().describe('איש קשר מטעם מנהל פרויקט'),
  workOrderer: z.string().optional().describe('מזמין העבודה'),
  workOrdererContact: z.string().optional().describe('איש קשר טעם מזמין העבודה'),
  nameContains: z.string().optional().describe('project name contains'),
  projectType: z.string().optional().describe('סוג פרויקט, e.g. "C"'),
  usageType: z.string().optional().describe('סוג השימוש, e.g. "מגורים"'),
  service: z.string().optional().describe('שירות'),
  status: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  hasArea: z.boolean().optional().describe('only quotes with a known area'),
})
type Filters = z.infer<typeof filtersSchema>

function buildMongoFilter(f: Filters = {}): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  // developer and client are the same underlying party — match either against the developer field.
  if (f.client || f.developer) q.developer = rx((f.client ?? f.developer) as string)
  if (f.developerContact) q.developerContact = rx(f.developerContact)
  if (f.projectManagement) q.projectManagement = rx(f.projectManagement)
  if (f.projectManagerContact) q.projectManagerContact = rx(f.projectManagerContact)
  if (f.workOrderer) q.workOrderer = rx(f.workOrderer)
  if (f.workOrdererContact) q.workOrdererContact = rx(f.workOrdererContact)
  if (f.nameContains) q.name = rx(f.nameContains)
  if (f.projectType) q.projectType = f.projectType
  if (f.usageType) q.usageType = rx(f.usageType)
  if (f.service) q.service = rx(f.service)
  if (f.status) q.status = rx(f.status)
  if (f.minPrice != null || f.maxPrice != null) {
    const price: Record<string, number> = {}
    if (f.minPrice != null) price.$gte = f.minPrice
    if (f.maxPrice != null) price.$lte = f.maxPrice
    q.price = price
  }
  if (f.hasArea) q.areaSqm = { $gt: 0 }
  return q
}

export const queryQuotes = betaZodTool({
  name: 'query_quotes',
  description:
    'Query the indexed price quotes with filters (client, project type, usage type, service, status, price range, has-area). Returns matching quotes with their key fields + Sheet/Doc/folder links. Use for "compare a client\'s quotes", "which projects over X", etc.',
  inputSchema: z.object({
    ...filtersSchema.shape,
    sortBy: z.enum(['price', 'areaSqm', 'quoteSentDate', 'name']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    limit: z.number().optional().describe('default 50, max 200'),
  }),
  run: async (args) => {
    await connectDB()
    const { sortBy, sortDir, limit, ...f } = args
    const filter = buildMongoFilter(f)
    const sort: Record<string, 1 | -1> = sortBy ? { [sortBy]: sortDir === 'asc' ? 1 : -1 } : { price: -1 }
    const recs = await QuoteRecord.find(filter)
      .sort(sort)
      .limit(Math.min(limit ?? 50, 200))
      .lean()
    return JSON.stringify({
      count: recs.length,
      quotes: recs.map((r) => ({
        itemId: r.itemId,
        name: r.name,
        quoteNumber: r.quoteNumber ?? null,
        client: r.client ?? null,
        developer: r.developer ?? null,
        developerContact: r.developerContact ?? null,
        projectManagement: r.projectManagement ?? null,
        projectManagerContact: r.projectManagerContact ?? null,
        workOrderer: r.workOrderer ?? null,
        workOrdererContact: r.workOrdererContact ?? null,
        projectType: r.projectType ?? null,
        usageType: r.usageType ?? null,
        service: r.service ?? null,
        status: r.status ?? null,
        price: r.price ?? null,
        areaSqm: r.areaSqm ?? null,
        pricePerSqm: r.price != null && r.areaSqm ? Math.round(r.price / r.areaSqm) : null,
        location: r.location ?? null,
        quoteSentDate: r.quoteSentDate ?? null,
        sheetUrl: r.sheetUrl ?? null,
        docUrl: r.docUrl ?? null,
        driveFolderUrl: r.driveFolderUrl ?? null,
      })),
    })
  },
})

export const aggregateQuotes = betaZodTool({
  name: 'aggregate_quotes',
  description:
    'Group the indexed quotes by a dimension (client / projectType / usageType / service / status / stage) and return per-group stats: count, total & average price, total & average area, and price per m². Use for "average ₪/m² by usage type", "total quoted per client", etc.',
  inputSchema: z.object({
    groupBy: z.enum([
      'client',
      'developer',
      'developerContact',
      'projectManagement',
      'projectManagerContact',
      'workOrderer',
      'workOrdererContact',
      'projectType',
      'usageType',
      'service',
      'status',
      'stage',
    ]),
    filters: filtersSchema.optional(),
    sortBy: z.enum(['count', 'sumPrice', 'avgPrice', 'sumArea', 'avgArea', 'pricePerSqm']).optional(),
    limit: z.number().optional().describe('default 50'),
  }),
  run: async ({ groupBy, filters, sortBy, limit }) => {
    await connectDB()
    const match = buildMongoFilter(filters ?? {})
    const rows = await QuoteRecord.aggregate([
      { $match: match },
      {
        $group: {
          _id: `$${groupBy}`,
          count: { $sum: 1 },
          sumPrice: { $sum: { $ifNull: ['$price', 0] } },
          priceCount: { $sum: { $cond: [{ $ne: ['$price', null] }, 1, 0] } },
          sumArea: { $sum: { $ifNull: ['$areaSqm', 0] } },
          areaCount: { $sum: { $cond: [{ $gt: ['$areaSqm', 0] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          group: '$_id',
          count: 1,
          sumPrice: 1,
          avgPrice: { $cond: [{ $gt: ['$priceCount', 0] }, { $divide: ['$sumPrice', '$priceCount'] }, null] },
          sumArea: 1,
          avgArea: { $cond: [{ $gt: ['$areaCount', 0] }, { $divide: ['$sumArea', '$areaCount'] }, null] },
          pricePerSqm: { $cond: [{ $gt: ['$sumArea', 0] }, { $divide: ['$sumPrice', '$sumArea'] }, null] },
        },
      },
      { $sort: { [sortBy ?? 'count']: -1 } },
      { $limit: Math.min(limit ?? 50, 200) },
    ])
    const round = (n: number | null) => (n == null ? null : Math.round(n))
    return JSON.stringify(
      rows.map((r) => ({
        group: r.group ?? '(none)',
        count: r.count,
        sumPrice: round(r.sumPrice),
        avgPrice: round(r.avgPrice),
        sumArea: round(r.sumArea),
        avgArea: round(r.avgArea),
        pricePerSqm: round(r.pricePerSqm),
      }))
    )
  },
})

export const getQuote = betaZodTool({
  name: 'get_quote',
  description:
    'Get the full indexed record for one quote by Monday item id (all fields + Sheet/Doc/folder links). Use to inspect a specific quote after locating it with query_quotes or find_quote.',
  inputSchema: z.object({ itemId: z.string() }),
  run: async ({ itemId }) => {
    await connectDB()
    const r = await QuoteRecord.findOne({ itemId }).lean()
    return r ? JSON.stringify(r) : 'NOT_INDEXED (run sync_index, or the item may not exist)'
  },
})

export const syncIndex = betaZodTool({
  name: 'sync_index',
  description:
    'Refresh the quote index from Monday now (upserts all items) and backfill a batch of missing areas from the sheets. Use when Maxim asks to refresh, or when data looks stale.',
  inputSchema: z.object({
    areaBatch: z.number().optional().describe('how many missing areas to backfill this run (default 40)'),
  }),
  run: async ({ areaBatch }) => {
    const sync = await syncFromMonday()
    const areas = await backfillAreas(areaBatch ?? 40)
    return JSON.stringify({ synced: sync.total, areasUpdated: areas.updated, areasScanned: areas.scanned })
  },
})

// Resolve a quote's sheet id from the index (fallback to reading the Monday item).
async function resolveSheetId(itemId: string): Promise<string | null> {
  await connectDB()
  const r = await QuoteRecord.findOne({ itemId }).lean()
  if (r?.sheetId) return r.sheetId
  if (r?.sheetUrl) return parseSheetId(r.sheetUrl)
  const it = await readQuoteItem(itemId)
  return it?.sheetLink ? parseSheetId(it.sheetLink) : null
}

const SHEET_CHAR_CAP = 14000

export const readQuoteSheet = betaZodTool({
  name: 'read_quote_sheet',
  description:
    'Open a quote\'s work-plan Google Sheet and return its detail tabs (WorkingSheet / ToQuote / Prices) as cell grids, so you can read line-item pricing, rates, area, and price-per-m² — including per-section figures like תאום מערכות that are NOT in the index. Use this for detailed per-quote questions. Reads one sheet per call; for a few quotes call it per item (avoid for very large sets).',
  inputSchema: z.object({
    itemId: z.string(),
    tabs: z.array(z.string()).optional().describe('which tabs to read; default WorkingSheet, ToQuote, Prices'),
  }),
  run: async ({ itemId, tabs }) => {
    const sheetId = await resolveSheetId(itemId)
    if (!sheetId) return 'NO_SHEET: this quote has no linked work-plan sheet on Monday'
    const grids = await readSheetTabs(sheetId, tabs && tabs.length ? tabs : undefined)
    if (Object.keys(grids).length === 0) return 'NO_DETAIL_TABS: none of the expected tabs were found in this sheet'
    let json = JSON.stringify(grids)
    if (json.length > SHEET_CHAR_CAP) {
      // Prefer ToQuote + WorkingSheet if the full payload is too large.
      const trimmed: Record<string, string[][]> = {}
      for (const t of ['ToQuote', 'WorkingSheet']) if (grids[t]) trimmed[t] = grids[t]
      json = JSON.stringify(trimmed).slice(0, SHEET_CHAR_CAP)
    }
    return json
  },
})

export const readQuoteDoc = betaZodTool({
  name: 'read_quote_doc',
  description:
    "Read a quote's final Google Doc (קובץ הצעה) — the authoritative quote sent to the client — as structured tables (via the Docs API). Returns the doc title + every table's rows/cells: the priced services (e.g. תאום מערכות, מידול פתחים), the מחיר למטר / שטח / מחיר מוצע table, and the milestone payment schedule. PREFER this over read_quote_sheet for pricing/section questions. Reads one doc per call.",
  inputSchema: z.object({ itemId: z.string() }),
  run: async ({ itemId }) => {
    await connectDB()
    const r = await QuoteRecord.findOne({ itemId }).lean()
    let docUrl = r?.docUrl ?? null
    if (!docUrl) {
      const it = await readQuoteItem(itemId)
      docUrl = it?.docLink ?? null
    }
    const docId = docUrl ? parseDocId(docUrl) : null
    if (!docId) return 'NO_DOC: this quote has no linked quote Doc on Monday (try read_quote_sheet)'
    const { title, tables } = await getDocTables(docId)
    if (tables.length === 0) return JSON.stringify({ title, tables: [], note: 'no tables found in this doc' })
    let json = JSON.stringify({ title, tables })
    if (json.length > SHEET_CHAR_CAP) json = json.slice(0, SHEET_CHAR_CAP)
    return json
  },
})

export const analyticsTools = [
  queryQuotes,
  aggregateQuotes,
  getQuote,
  readQuoteDoc,
  readQuoteSheet,
  syncIndex,
]
