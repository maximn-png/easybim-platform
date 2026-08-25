import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import PeacockPost from '@/lib/models/PeacockPost'
import { listIssues, listRecentTopics } from '@/lib/agents/peacock/newsletter'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/newsletter?issues=4
// Recent newsletter topics for the dashboard's idea card, each flagged with
// whether a post already cites it — so the same topic isn't posted twice.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const issuesParam = Number(req.nextUrl.searchParams.get('issues'))
  const issues = Math.min(12, Math.max(1, issuesParam || 4))

  try {
    const [topics, recentIssues] = await Promise.all([listRecentTopics({ issues }), listIssues(6)])

    await connectDB()
    const urls = topics.map((t) => t.sourceUrl).filter((u): u is string => !!u)
    const used = urls.length
      ? new Set(
          (await PeacockPost.find({ sourceUrl: { $in: urls } }).select({ sourceUrl: 1 }).lean())
            .map((p) => p.sourceUrl)
            .filter((u): u is string => !!u)
        )
      : new Set<string>()

    return NextResponse.json({
      topics: topics.map((t) => ({ ...t, used: !!t.sourceUrl && used.has(t.sourceUrl) })),
      issues: recentIssues,
      newsletterUrl: process.env.NEXT_PUBLIC_NEWSLETTER_URL ?? null,
    })
  } catch (err) {
    // The newsletter DB living beside us is an assumption worth surfacing plainly
    // rather than rendering an empty card.
    const message = err instanceof Error ? err.message : 'failed to read newsletters'
    return NextResponse.json({ error: message, topics: [], issues: [] }, { status: 500 })
  }
}
