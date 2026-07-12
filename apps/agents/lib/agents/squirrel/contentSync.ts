// Nightly Drive→Mongo content sync: mirror each quote's Doc (tables + text),
// work-plan Sheet (detail tabs), and project-folder inventory into QuoteContent,
// re-fetching only files whose Drive modifiedTime changed. Runs under a time
// budget so the cron converges over nights on first backfill and stays cheap
// in steady state.
import { connectDB } from '@/lib/db/mongoose'
import QuoteRecord from '@/lib/models/QuoteRecord'
import QuoteContent, { IQuoteContent } from '@/lib/models/QuoteContent'
import * as g from '@/lib/integrations/google/client'
import { readSheetTabs } from './quoteIndex'

export interface ContentSyncResult {
  scanned: number
  docsUpdated: number
  sheetsUpdated: number
  foldersUpdated: number
  skipped: number
  failed: number
  remaining: number
}

const DOC_TEXT_CAP = 60_000 // chars — quote docs are a few pages; cap defends against outliers

interface RecordLinks {
  itemId: string
  docUrl?: string | null
  sheetUrl?: string | null
  driveFolderUrl?: string | null
}

/** Sync one quote's content from Drive into the cache. Returns what was updated. */
async function syncOne(
  rec: RecordLinks,
  cached: Pick<IQuoteContent, 'doc' | 'sheet' | 'folder'> | null,
  force: boolean
): Promise<{ doc: boolean; sheet: boolean; folder: boolean; error?: string }> {
  const set: Record<string, unknown> = {}
  const out = { doc: false, sheet: false, folder: false } as { doc: boolean; sheet: boolean; folder: boolean; error?: string }
  const errors: string[] = []

  // ── quote Doc: tables + plain text ──
  const docId = rec.docUrl ? g.parseDocId(rec.docUrl) : null
  if (docId) {
    try {
      const meta = await g.getFileMeta(docId)
      if (force || !cached?.doc || cached.doc.fileId !== docId || cached.doc.modifiedTime !== meta.modifiedTime) {
        const { title, tables } = await g.getDocTables(docId)
        const text = (await g.exportGoogleFileText(docId).catch(() => '')).slice(0, DOC_TEXT_CAP)
        set.doc = {
          fileId: docId,
          url: rec.docUrl,
          modifiedTime: meta.modifiedTime ?? '',
          title,
          tables,
          text,
          syncedAt: new Date(),
        }
        out.doc = true
      }
    } catch (e) {
      errors.push(`doc: ${(e as Error).message}`)
    }
  } else if (cached?.doc) {
    set.doc = null // link removed on Monday — drop the stale cache
  }

  // ── work-plan Sheet: detail tabs ──
  const sheetId = rec.sheetUrl ? g.parseSheetId(rec.sheetUrl) : null
  if (sheetId) {
    try {
      const meta = await g.getFileMeta(sheetId)
      if (force || !cached?.sheet || cached.sheet.fileId !== sheetId || cached.sheet.modifiedTime !== meta.modifiedTime) {
        const tabs = await readSheetTabs(sheetId)
        set.sheet = {
          fileId: sheetId,
          url: rec.sheetUrl,
          modifiedTime: meta.modifiedTime ?? '',
          tabs,
          syncedAt: new Date(),
        }
        out.sheet = true
      }
    } catch (e) {
      errors.push(`sheet: ${(e as Error).message}`)
    }
  } else if (cached?.sheet) {
    set.sheet = null
  }

  // ── project folder: file inventory (one cheap list call) ──
  const folderId = rec.driveFolderUrl ? g.parseFolderId(rec.driveFolderUrl) : null
  if (folderId) {
    try {
      const files = await g.listFilesInFolder(folderId)
      set.folder = {
        folderId,
        files: files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime ?? null })),
        syncedAt: new Date(),
      }
      out.folder = true
    } catch (e) {
      errors.push(`folder: ${(e as Error).message}`)
    }
  }

  set.lastSyncedAt = new Date()
  set.lastError = errors.length ? errors.join(' | ') : null
  await QuoteContent.updateOne({ itemId: rec.itemId }, { $set: set }, { upsert: true })
  if (errors.length) out.error = errors.join(' | ')
  return out
}

/**
 * Sync quote content for records with Drive links, stalest-first, until the
 * time budget runs out. Steady state (nothing changed) is one metadata read
 * per doc/sheet + one folder list per quote — fast and cheap.
 */
export async function syncQuoteContent(
  opts: { timeBudgetMs?: number; force?: boolean; limit?: number } = {}
): Promise<ContentSyncResult> {
  const { timeBudgetMs = 240_000, force = false, limit = 1000 } = opts
  const deadline = Date.now() + timeBudgetMs
  await connectDB()

  const recs = (await QuoteRecord.find({
    $or: [
      { docUrl: { $nin: [null, ''] } },
      { sheetUrl: { $nin: [null, ''] } },
      { driveFolderUrl: { $nin: [null, ''] } },
    ],
  })
    .select('itemId docUrl sheetUrl driveFolderUrl')
    .lean()) as RecordLinks[]

  // Stalest-first: never-cached quotes first, then by oldest lastSyncedAt.
  const cachedDocs = await QuoteContent.find({ itemId: { $in: recs.map((r) => r.itemId) } })
    .select('itemId doc.fileId doc.modifiedTime sheet.fileId sheet.modifiedTime folder.folderId lastSyncedAt')
    .lean()
  const cacheByItem = new Map(cachedDocs.map((c) => [c.itemId, c]))
  recs.sort((a, b) => {
    const ta = cacheByItem.get(a.itemId)?.lastSyncedAt?.getTime() ?? 0
    const tb = cacheByItem.get(b.itemId)?.lastSyncedAt?.getTime() ?? 0
    return ta - tb
  })

  const res: ContentSyncResult = {
    scanned: 0,
    docsUpdated: 0,
    sheetsUpdated: 0,
    foldersUpdated: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
  }

  // Small worker pool — each quote is 2-6 Google API calls, so a concurrency of
  // 4 keeps the backfill fast without brushing Drive/Docs rate limits.
  const CONCURRENCY = 4
  let next = 0
  async function worker() {
    while (true) {
      if (Date.now() > deadline) return
      const idx = next++
      if (idx >= recs.length || idx >= limit) return
      const rec = recs[idx]
      res.scanned++
      try {
        const r = await syncOne(rec, (cacheByItem.get(rec.itemId) as IQuoteContent | undefined) ?? null, force)
        if (r.doc) res.docsUpdated++
        if (r.sheet) res.sheetsUpdated++
        if (r.folder) res.foldersUpdated++
        if (!r.doc && !r.sheet) res.skipped++
        if (r.error) res.failed++
      } catch (e) {
        res.failed++
        console.error(`[squirrel] content sync failed for ${rec.itemId}:`, (e as Error).message)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  res.remaining = Math.max(0, recs.length - res.scanned)
  return res
}

/** Refresh one quote's cache on demand (used by chat tools after a live read). */
export async function refreshOne(itemId: string): Promise<void> {
  await connectDB()
  const rec = (await QuoteRecord.findOne({ itemId })
    .select('itemId docUrl sheetUrl driveFolderUrl')
    .lean()) as RecordLinks | null
  if (!rec) return
  const cached = await QuoteContent.findOne({ itemId }).lean()
  await syncOne(rec, cached as IQuoteContent | null, false)
}
