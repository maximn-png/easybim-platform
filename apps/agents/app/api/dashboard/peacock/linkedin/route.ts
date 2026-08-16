import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { analyticsSummary, topPosts, weeklySeries } from '@/lib/agents/peacock/analytics'
import { disconnect, isConfigured } from '@/lib/integrations/linkedin/client'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/linkedin?weeks=8 — everything the analytics cards need.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const weeks = Math.min(26, Math.max(4, Number(req.nextUrl.searchParams.get('weeks')) || 8))
  const [summary, series, top] = await Promise.all([analyticsSummary(), weeklySeries(weeks), topPosts(5)])

  return NextResponse.json({
    // `configured` = the app credentials exist at all; `connected` = a page is linked.
    // The dashboard needs both to decide between "set it up", "connect" and "connected".
    configured: isConfigured(),
    ...summary,
    series,
    topPosts: top,
  })
}

// DELETE /api/dashboard/peacock/linkedin — unlink the page (keeps stored history).
export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await disconnect()
  return NextResponse.json({ ok: true })
}
