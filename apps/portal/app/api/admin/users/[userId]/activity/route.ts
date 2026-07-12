import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { getActivityEventModel } from '@easybim/db'
import { guardAdmin } from '@/lib/adminApi'

export interface TimelineEvent {
  type: 'sign_in' | 'card_open' | 'app_visit'
  at: number
  app?: string
  count?: number
  browser?: string
}

// GET /api/admin/users/:userId/activity?days=7
// Timeline for the admin page drawer: card opens + app visits from the
// activity log, sign-ins from Clerk's session list.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const { userId } = await params
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 7))
  const since = Date.now() - days * 24 * 60 * 60 * 1000

  const events: TimelineEvent[] = []

  try {
    const ActivityEvent = await getActivityEventModel()
    const docs = await ActivityEvent.find({ userId, createdAt: { $gte: new Date(since) } })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean()
    for (const doc of docs) {
      events.push({
        type: doc.type,
        app: doc.app,
        at: new Date(doc.updatedAt ?? doc.createdAt).getTime(),
        count: doc.count,
      })
    }
  } catch (err) {
    console.error('[admin/activity] mongo query failed:', err)
  }

  try {
    const client = await clerkClient()
    const { data: sessions } = await client.sessions.getSessionList({ userId, limit: 50 })
    for (const s of sessions) {
      if (s.createdAt < since) continue
      const activity = s.latestActivity
      const browser = activity?.browserName
        ? `${activity.browserName}${activity.deviceType ? ` on ${activity.deviceType}` : activity.isMobile ? ' (mobile)' : ''}`
        : undefined
      events.push({ type: 'sign_in', at: s.createdAt, browser })
    }
  } catch (err) {
    console.error('[admin/activity] clerk sessions failed:', err)
  }

  events.sort((a, b) => b.at - a.at)
  return NextResponse.json({ events, days })
}
