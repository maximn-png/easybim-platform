import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import QuoteRecord from '@/lib/models/QuoteRecord'
import QuoteContent from '@/lib/models/QuoteContent'
import { syncFromMonday, backfillAreas, readSheetTabs } from './quoteIndex'
import { syncQuoteContent, refreshOne } from './contentSync'
import { readQuoteItem } from './board'
import { parseSheetId, parseDocId, getDocTables, getFileMeta } from '@/lib/integrations/google/client'

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
    'Refresh the quote index from Monday now (upserts all items) and backfill a batch of missing areas from the sheets. Optionally also refresh a batch of the doc/sheet content cache. Use when Maxim asks to refresh, or when data looks stale.',
  inputSchema: z.object({
    areaBatch: z.number().optional().describe('how many missing areas to backfill this run (default 40)'),
    contentBatch: z
      .number()
      .optional()
      .describe('also refresh the Drive content cache for up to N quotes (default 0 = skip)'),
  }),
  run: async ({ areaBatch, contentBatch }) => {
    const sync = await syncFromMonday()
    const areas = await backfillAreas(areaBatch ?? 40)
    const content =
      contentBatch && contentBatch > 0
        ? await syncQuoteContent({ limit: contentBatch, timeBudgetMs: 120_000 })
        : null
    return JSON.stringify({
      synced: sync.total,
      areasUpdated: areas.updated,
      areasScanned: areas.scanned,
      ...(content ? { content } : {}),
    })
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

function capSheetJson(grids: Record<string, string[][]>): string {
  let json = JSON.stringify(grids)
  if (json.length > SHEET_CHAR_CAP) {
    // Prefer ToQuote + WorkingSheet if the full payload is too large.
    const trimmed: Record<string, string[][]> = {}
    for (const t of ['ToQuote', 'WorkingSheet']) if (grids[t]) trimmed[t] = grids[t]
    json = JSON.stringify(trimmed).slice(0, SHEET_CHAR_CAP)
  }
  return json
}

export const readQuoteSheet = betaZodTool({
  name: 'read_quote_sheet',
  description:
    'Read a quote\'s work-plan Google Sheet detail tabs (WorkingSheet / ToQuote / Prices) as cell grids, so you can read line-item pricing, rates, area, and price-per-m² — including per-section figures like תאום מערכות that are NOT in the index. Served from the nightly Mongo cache when fresh (fast), read live from Drive otherwise. Use this for detailed per-quote questions.',
  inputSchema: z.object({
    itemId: z.string(),
    tabs: z.array(z.string()).optional().describe('which tabs to read; default WorkingSheet, ToQuote, Prices'),
  }),
  run: async ({ itemId, tabs }) => {
    await connectDB()
    // Cache-first: serve the mirrored tabs if the sheet hasn't changed in Drive.
    const cached = await QuoteContent.findOne({ itemId }).select('sheet').lean()
    if (cached?.sheet?.tabs && Object.keys(cached.sheet.tabs).length > 0) {
      const wanted = tabs && tabs.length ? tabs : Object.keys(cached.sheet.tabs)
      const allCached = wanted.every((t) => cached.sheet!.tabs[t] != null)
      if (allCached) {
        const meta = await getFileMeta(cached.sheet.fileId).catch(() => null)
        if (meta && meta.modifiedTime === cached.sheet.modifiedTime) {
          const grids: Record<string, string[][]> = {}
          for (const t of wanted) grids[t] = cached.sheet.tabs[t]
          return capSheetJson(grids)
        }
        // Changed in Drive — refresh the cache, then serve it.
        await refreshOne(itemId)
        const fresh = await QuoteContent.findOne({ itemId }).select('sheet').lean()
        if (fresh?.sheet?.tabs && wanted.every((t) => fresh.sheet!.tabs[t] != null)) {
          const grids: Record<string, string[][]> = {}
          for (const t of wanted) grids[t] = fresh.sheet.tabs[t]
          return capSheetJson(grids)
        }
      }
    }
    // Cache miss (or custom tabs outside the cached set) — live read.
    const sheetId = await resolveSheetId(itemId)
    if (!sheetId) return 'NO_SHEET: this quote has no linked work-plan sheet on Monday'
    const grids = await readSheetTabs(sheetId, tabs && tabs.length ? tabs : undefined)
    if (Object.keys(grids).length === 0) return 'NO_DETAIL_TABS: none of the expected tabs were found in this sheet'
    await refreshOne(itemId).catch(() => {}) // warm the cache for next time
    return capSheetJson(grids)
  },
})

export const readQuoteDoc = betaZodTool({
  name: 'read_quote_doc',
  description:
    "Read a quote's final Google Doc (קובץ הצעה) — the authoritative quote sent to the client — as structured tables: the priced services (e.g. תאום מערכות, מידול פתחים), the מחיר למטר / שטח / מחיר מוצע table, and the milestone payment schedule. Served from the nightly Mongo cache when fresh (fast), read live from Drive otherwise. PREFER this over read_quote_sheet for pricing/section questions.",
  inputSchema: z.object({ itemId: z.string() }),
  run: async ({ itemId }) => {
    await connectDB()
    // Cache-first: serve the mirrored tables if the doc hasn't changed in Drive.
    const cached = await QuoteContent.findOne({ itemId }).select('doc').lean()
    if (cached?.doc?.tables) {
      const meta = await getFileMeta(cached.doc.fileId).catch(() => null)
      if (meta && meta.modifiedTime === cached.doc.modifiedTime) {
        let json = JSON.stringify({ title: cached.doc.title, tables: cached.doc.tables })
        if (json.length > SHEET_CHAR_CAP) json = json.slice(0, SHEET_CHAR_CAP)
        return json
      }
      // Changed in Drive — refresh the cache, then serve it.
      await refreshOne(itemId)
      const fresh = await QuoteContent.findOne({ itemId }).select('doc').lean()
      if (fresh?.doc?.tables) {
        let json = JSON.stringify({ title: fresh.doc.title, tables: fresh.doc.tables })
        if (json.length > SHEET_CHAR_CAP) json = json.slice(0, SHEET_CHAR_CAP)
        return json
      }
    }
    // Cache miss — live read, then warm the cache.
    const r = await QuoteRecord.findOne({ itemId }).lean()
    let docUrl = r?.docUrl ?? null
    if (!docUrl) {
      const it = await readQuoteItem(itemId)
      docUrl = it?.docLink ?? null
    }
    const docId = docUrl ? parseDocId(docUrl) : null
    if (!docId) return 'NO_DOC: this quote has no linked quote Doc on Monday (try read_quote_sheet)'
    const { title, tables } = await getDocTables(docId)
    await refreshOne(itemId).catch(() => {})
    if (tables.length === 0) return JSON.stringify({ title, tables: [], note: 'no tables found in this doc' })
    let json = JSON.stringify({ title, tables })
    if (json.length > SHEET_CHAR_CAP) json = json.slice(0, SHEET_CHAR_CAP)
    return json
  },
})

// Snippet of doc text around the first case-insensitive match (for search results).
function snippetAround(text: string, query: string, radius = 120): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

export const searchQuoteContent = betaZodTool({
  name: 'search_quote_content',
  description:
    'Search INSIDE the cached quote documents (full text of every quote Doc) for a word or phrase — e.g. a service name, a clause, a term like "תאום מערכות" or "ACC". Returns matching quotes with a text snippet + key index fields. Use when Maxim asks which quotes mention/contain something, or to find similar past quotes as reference material.',
  inputSchema: z.object({
    query: z.string().describe('word or phrase to search for in the quote docs'),
    filters: filtersSchema.optional().describe('optional index filters to narrow the search'),
    limit: z.number().optional().describe('default 20, max 50'),
  }),
  run: async ({ query, filters, limit }) => {
    await connectDB()
    const cap = Math.min(limit ?? 20, 50)

    // Optional index filters → allowed itemIds.
    let allowedIds: string[] | null = null
    if (filters && Object.keys(filters).length > 0) {
      const recs = await QuoteRecord.find(buildMongoFilter(filters)).select('itemId').lean()
      allowedIds = recs.map((r) => r.itemId)
      if (allowedIds.length === 0) return JSON.stringify({ count: 0, matches: [] })
    }

    const idFilter = allowedIds ? { itemId: { $in: allowedIds } } : {}
    // Regex match over the cached doc text/title (works for Hebrew phrases; $text
    // tokenization is unreliable for Hebrew, so regex is the primary path).
    const pattern = rx(query)
    const hits = await QuoteContent.find({
      ...idFilter,
      $or: [{ 'doc.text': pattern }, { 'doc.title': pattern }],
    })
      .select('itemId doc.title doc.text')
      .limit(cap)
      .lean()

    if (hits.length === 0) {
      const cachedCount = await QuoteContent.countDocuments({ 'doc.text': { $exists: true, $ne: '' } })
      return JSON.stringify({
        count: 0,
        matches: [],
        note: `no matches in ${cachedCount} cached quote docs (cache refreshes nightly; sync_index with contentBatch to refresh now)`,
      })
    }

    const recs = await QuoteRecord.find({ itemId: { $in: hits.map((h) => h.itemId) } }).lean()
    const byId = new Map(recs.map((r) => [r.itemId, r]))
    return JSON.stringify({
      count: hits.length,
      matches: hits.map((h) => {
        const r = byId.get(h.itemId)
        return {
          itemId: h.itemId,
          name: r?.name ?? h.doc?.title ?? '',
          quoteNumber: r?.quoteNumber ?? null,
          client: r?.client ?? null,
          price: r?.price ?? null,
          status: r?.status ?? null,
          docTitle: h.doc?.title ?? null,
          snippet: h.doc?.text ? snippetAround(h.doc.text, query) : null,
          docUrl: r?.docUrl ?? null,
        }
      }),
    })
  },
})

export const analyticsTools = [
  queryQuotes,
  aggregateQuotes,
  getQuote,
  readQuoteDoc,
  readQuoteSheet,
  searchQuoteContent,
  syncIndex,
]
