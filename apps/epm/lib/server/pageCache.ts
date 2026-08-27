// MongoDB-backed stale-while-revalidate cache for the project page's slow,
// externally-sourced panels (Monday updates ~30s, ACC coordination models
// ~10-30s, Monday hours ~10s). The in-memory caches these replace died with
// every cold serverless instance, so most page views paid the full live cost.
//
// Semantics: the FIRST view of a project pays the live cost and stores a
// snapshot; every later view answers instantly from Mongo, and when the
// snapshot is older than its TTL a background refresh (after()) re-fetches
// and re-stores it AFTER the response is sent. A failing refresh keeps the
// last good snapshot — transient Monday/ACC errors no longer blank a panel.

import mongoose, { Schema, type Model } from 'mongoose'
import { after } from 'next/server'
import { connectDB } from '@easybim/db'

interface PageCacheDoc {
  key: string
  payload: unknown
  updatedAt: Date
}

const PageCacheSchema = new Schema<PageCacheDoc>(
  {
    key:       { type: String, required: true, unique: true, index: true },
    payload:   { type: Schema.Types.Mixed },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'epm_page_cache', versionKey: false },
)

const PageCache: Model<PageCacheDoc> =
  (mongoose.models.EpmPageCache as Model<PageCacheDoc>) ??
  mongoose.model<PageCacheDoc>('EpmPageCache', PageCacheSchema)

// Refreshes already in flight in this instance, so a burst of stale hits
// doesn't fan out into N identical background fetches.
const inflight = new Set<string>()

async function revalidate(key: string, fetcher: () => Promise<unknown>) {
  if (inflight.has(key)) return
  inflight.add(key)
  try {
    const payload = await fetcher()
    await PageCache.updateOne(
      { key },
      { $set: { payload, updatedAt: new Date() } },
      { upsert: true },
    )
  } catch (err) {
    console.warn(`[pageCache] background refresh failed for ${key} (kept last snapshot):`, err)
  } finally {
    inflight.delete(key)
  }
}

/**
 * Serve `key` from the Mongo snapshot when present (refreshing in the
 * background once it's older than ttlMs); fetch live only on the first call
 * ever or when `forceRefresh` is set. The fetcher's payload must be JSON-able.
 */
/**
 * Like swrCache, but a cold cache NEVER blocks the request: with no snapshot
 * yet, the fetcher runs after the response (building: true) and the caller
 * renders a "still preparing" state. For payloads too slow to compute inline.
 */
export async function swrCacheBackground<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  forceRefresh = false,
): Promise<{ data: T | null; cachedAt: Date | null; building: boolean }> {
  await connectDB()

  const hit = await PageCache.findOne({ key }).lean() as PageCacheDoc | null
  if (hit) {
    if (forceRefresh || Date.now() - hit.updatedAt.getTime() > ttlMs) {
      after(() => revalidate(key, fetcher))
    }
    return { data: hit.payload as T, cachedAt: hit.updatedAt, building: false }
  }

  after(() => revalidate(key, fetcher))
  return { data: null, cachedAt: null, building: true }
}

// Plain get/set on the same collection, for caches whose freshness is decided
// by the caller (e.g. the updates summary, keyed by a content hash) rather
// than by a TTL.
export async function cacheGet<T>(key: string): Promise<T | null> {
  await connectDB()
  const hit = await PageCache.findOne({ key }).lean() as PageCacheDoc | null
  return (hit?.payload as T) ?? null
}

export async function cacheSet(key: string, payload: unknown): Promise<void> {
  await connectDB()
  await PageCache.updateOne(
    { key },
    { $set: { payload, updatedAt: new Date() } },
    { upsert: true },
  )
}

export async function swrCache<T>(
  key: string,
  ttlMs: number,
  forceRefresh: boolean,
  fetcher: () => Promise<T>,
): Promise<{ data: T; cachedAt: Date | null }> {
  await connectDB()

  if (!forceRefresh) {
    const hit = await PageCache.findOne({ key }).lean() as PageCacheDoc | null
    if (hit) {
      if (Date.now() - hit.updatedAt.getTime() > ttlMs) {
        after(() => revalidate(key, fetcher))
      }
      return { data: hit.payload as T, cachedAt: hit.updatedAt }
    }
  }

  const payload = await fetcher()
  await PageCache.updateOne(
    { key },
    { $set: { payload, updatedAt: new Date() } },
    { upsert: true },
  )
  return { data: payload, cachedAt: null }
}
