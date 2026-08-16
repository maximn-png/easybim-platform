// LinkedIn analytics for the Peacock dashboard.
//
// Two independent sources feed the same shapes, so the dashboard doesn't care
// which is in play:
//   1. the page-analytics export a page admin can download today (parseAnalyticsExport)
//   2. the LinkedIn API sync, once the org is connected (integrations/linkedin)
// Per-post numbers can also just be typed into the drawer.
import { connectDB } from '@/lib/db/mongoose'
import LinkedInDaily, { DailySource } from '@/lib/models/LinkedInDaily'
import LinkedInAccount from '@/lib/models/LinkedInAccount'
import PeacockPost, { engagementRate, engagementTotal, PostMetrics } from '@/lib/models/PeacockPost'
import { ParsedRow } from './analyticsImport'

// The export parser lives in analyticsImport.ts (pure, no DB) so it can be tested
// directly; re-exported here so callers have one import site.
export { parseAnalyticsExport } from './analyticsImport'
export type { ParsedRow, ParseResult } from './analyticsImport'

// ---------------------------------------------------------------------------
// weekly series (the Impressions chart)
// ---------------------------------------------------------------------------

export interface WeekPoint {
  /** The week's Sunday as local YYYY-MM-DD (Israeli week). */
  weekStart: string
  label: string // "6 Jul"
  impressions: number
  engagements: number
  /** Posts published that week — the chart annotates volume against reach. */
  posts: number
}

function weekStartOf(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}

/**
 * Local YYYY-MM-DD. Used for both the bucket keys and the returned `weekStart`.
 * Deliberately NOT toISOString(): local midnight in Israel is the previous day in
 * UTC, so an ISO key would read a day earlier than its own label and invite a
 * "fix" that breaks the bucketing.
 */
function localDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Impressions + engagements per week for the last `weeks` weeks, ending this week.
 * Page-level daily rows are the primary source; when there are none for a week we
 * fall back to summing that week's per-post metrics, so typing numbers into a few
 * posts is enough to make the chart real.
 */
export async function weeklySeries(weeks = 8): Promise<WeekPoint[]> {
  await connectDB()
  const thisWeek = weekStartOf(new Date())
  const from = new Date(thisWeek)
  from.setDate(from.getDate() - (weeks - 1) * 7)

  const buckets = new Map<string, WeekPoint>()
  for (let i = 0; i < weeks; i++) {
    const ws = new Date(from)
    ws.setDate(ws.getDate() + i * 7)
    buckets.set(localDayKey(ws), {
      weekStart: localDayKey(ws),
      label: ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      impressions: 0,
      engagements: 0,
      posts: 0,
    })
  }

  const [daily, posts] = await Promise.all([
    LinkedInDaily.find({ date: { $gte: from } }).lean(),
    PeacockPost.find({ status: 'published', publishDate: { $gte: from } })
      .select({ publishDate: 1, metrics: 1 })
      .lean(),
  ])

  for (const row of daily) {
    const key = localDayKey(weekStartOf(new Date(row.date)))
    const b = buckets.get(key)
    if (!b) continue
    b.impressions += row.impressions ?? 0
    b.engagements += row.engagements ?? 0
  }

  // Weeks with page-level data keep it; the rest borrow from per-post metrics.
  const weeksWithDaily = new Set(
    daily.map((r) => localDayKey(weekStartOf(new Date(r.date))))
  )
  for (const p of posts) {
    if (!p.publishDate) continue
    const key = localDayKey(weekStartOf(new Date(p.publishDate)))
    const b = buckets.get(key)
    if (!b) continue
    b.posts += 1
    if (weeksWithDaily.has(key)) continue
    const m = p.metrics as PostMetrics | undefined
    b.impressions += m?.impressions ?? 0
    b.engagements += engagementTotal(m)
  }

  return [...buckets.values()]
}

// ---------------------------------------------------------------------------
// headline numbers + top posts
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  connected: boolean
  organizationName: string | null
  lastSyncAt: string | null
  /** Any numbers at all? Drives whether the dashboard shows charts or the empty state. */
  hasData: boolean
  impressions30d: number
  engagements30d: number
  engagementRate30d: number | null
  followers: number | null
  followersGained30d: number | null
  postsWithMetrics: number
  publishedTotal: number
  sources: DailySource[]
}

export async function analyticsSummary(): Promise<AnalyticsSummary> {
  await connectDB()
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const [account, daily, posts, publishedTotal] = await Promise.all([
    LinkedInAccount.findOne({ key: 'peacock' }).lean(),
    LinkedInDaily.find({ date: { $gte: since } }).sort({ date: 1 }).lean(),
    PeacockPost.find({ status: 'published', 'metrics.impressions': { $gt: 0 } })
      .select({ publishDate: 1, metrics: 1 })
      .lean(),
    PeacockPost.countDocuments({ status: 'published' }),
  ])

  let impressions = daily.reduce((n, r) => n + (r.impressions ?? 0), 0)
  let engagements = daily.reduce((n, r) => n + (r.engagements ?? 0), 0)

  // No page-level rows for the window → derive from posts published in it.
  if (impressions === 0) {
    for (const p of posts) {
      if (!p.publishDate || new Date(p.publishDate) < since) continue
      const m = p.metrics as PostMetrics | undefined
      impressions += m?.impressions ?? 0
      engagements += engagementTotal(m)
    }
  }

  const withFollowers = [...daily].reverse().find((r) => typeof r.followers === 'number')
  const followersGained = daily.reduce((n, r) => n + (r.followersGained ?? 0), 0)

  return {
    connected: !!account,
    organizationName: account?.organizationName ?? null,
    lastSyncAt: account?.lastSyncAt ? new Date(account.lastSyncAt).toISOString() : null,
    hasData: impressions > 0 || engagements > 0 || posts.length > 0,
    impressions30d: impressions,
    engagements30d: engagements,
    engagementRate30d: impressions > 0 ? (engagements / impressions) * 100 : null,
    followers: withFollowers?.followers ?? null,
    followersGained30d: daily.length ? followersGained : null,
    postsWithMetrics: posts.length,
    publishedTotal,
    sources: [...new Set(daily.map((r) => r.source))],
  }
}

export interface TopPost {
  id: string
  title: string
  postType: string | null
  publishDate: string | null
  linkedinUrl: string | null
  impressions: number
  engagements: number
  rate: number | null
}

/** Best published posts by impressions — the "what worked" list. */
export async function topPosts(limit = 5): Promise<TopPost[]> {
  await connectDB()
  const docs = await PeacockPost.find({ status: 'published', 'metrics.impressions': { $gt: 0 } })
    .sort({ 'metrics.impressions': -1 })
    .limit(limit)
    .select({ title: 1, postType: 1, publishDate: 1, linkedinUrl: 1, metrics: 1 })
    .lean()

  return docs.map((d) => {
    const m = d.metrics as PostMetrics | undefined
    return {
      id: String(d._id),
      title: d.title,
      postType: d.postType ?? null,
      publishDate: d.publishDate ? new Date(d.publishDate).toISOString() : null,
      linkedinUrl: d.linkedinUrl ?? null,
      impressions: m?.impressions ?? 0,
      engagements: engagementTotal(m),
      rate: engagementRate(m),
    }
  })
}

// ---------------------------------------------------------------------------
// import: LinkedIn's page-analytics export
// ---------------------------------------------------------------------------

/** Upsert parsed daily rows, merging into whatever is already stored for those days. */
export async function saveDailyRows(rows: ParsedRow[], source: DailySource = 'import'): Promise<number> {
  await connectDB()
  if (rows.length === 0) return 0
  const ops = rows.map((r) => {
    const date = new Date(r.date)
    date.setHours(0, 0, 0, 0)
    const set: Record<string, unknown> = { source }
    for (const k of ['impressions', 'uniqueImpressions', 'engagements', 'clicks', 'followers', 'followersGained'] as const) {
      if (r[k] !== undefined) set[k] = r[k]
    }
    return {
      updateOne: {
        filter: { date },
        update: { $set: set, $setOnInsert: { date } },
        upsert: true,
      },
    }
  })
  const res = await LinkedInDaily.bulkWrite(ops)
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0)
}
