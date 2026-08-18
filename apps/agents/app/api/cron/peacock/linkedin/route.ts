import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import PeacockPost from '@/lib/models/PeacockPost'
import { ParsedRow, saveDailyRows } from '@/lib/agents/peacock/analytics'
import {
  dailyShareStats, followerCount, getAccount, LinkedInNotConnectedError, shareStats, shareUrnFromUrl,
} from '@/lib/integrations/linkedin/client'

export const runtime = 'nodejs'
export const maxDuration = 300

// Daily LinkedIn sync (vercel.json). Pulls page day-stats for the last 30 days
// plus per-post lifetime stats for published posts that carry a LinkedIn URL.
//
// No-ops cleanly with 200 + skipped:true when LinkedIn isn't connected, so a
// scheduled run doesn't alarm anyone before the app exists.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await getAccount()
  if (!account) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'LinkedIn not connected' })
  }

  const errors: string[] = []
  let dailyWritten = 0
  let postsUpdated = 0

  try {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 30)

    const [stats, followers] = await Promise.all([
      dailyShareStats(from, to),
      followerCount().catch(() => null),
    ])

    const rows: ParsedRow[] = stats.map((s) => ({
      date: s.date,
      impressions: s.impressions,
      uniqueImpressions: s.uniqueImpressions,
      engagements: s.engagements,
      clicks: s.clicks,
    }))
    // Follower total is a point-in-time value — stamp it on today's row.
    if (typeof followers === 'number') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayRow = rows.find((r) => r.date.getTime() === today.getTime())
      if (todayRow) Object.assign(todayRow, { followers })
      else rows.push({ date: today, impressions: 0, uniqueImpressions: 0, engagements: 0, clicks: 0, followers })
    }
    dailyWritten = await saveDailyRows(rows, 'linkedin')
  } catch (err) {
    if (err instanceof LinkedInNotConnectedError) {
      return NextResponse.json({ ok: true, skipped: true, reason: err.message })
    }
    errors.push(`page stats: ${err instanceof Error ? err.message : 'unknown'}`)
  }

  // Per-post lifetime metrics for anything published with a URL.
  try {
    await connectDB()
    const posts = await PeacockPost.find({
      status: 'published',
      linkedinUrl: { $nin: [null, ''] },
    })
      .select({ linkedinUrl: 1, metrics: 1 })
      .limit(100)

    for (const post of posts) {
      const urn = shareUrnFromUrl(post.linkedinUrl ?? '')
      if (!urn) continue
      try {
        const m = await shareStats(urn)
        if (!m) continue
        post.metrics = { ...m, source: 'linkedin', syncedAt: new Date() }
        await post.save()
        postsUpdated += 1
      } catch (err) {
        errors.push(`post ${post.id}: ${err instanceof Error ? err.message : 'unknown'}`)
      }
    }
  } catch (err) {
    errors.push(`post stats: ${err instanceof Error ? err.message : 'unknown'}`)
  }

  account.lastSyncAt = new Date()
  account.lastSyncError = errors.length ? errors.slice(0, 5).join(' | ') : undefined
  await account.save()

  return NextResponse.json({ ok: errors.length === 0, dailyWritten, postsUpdated, errors })
}
