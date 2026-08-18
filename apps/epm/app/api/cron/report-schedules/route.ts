import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { recordRun } from '@/lib/server/scheduleRunner'

// Fires due report schedules. Public to the Clerk middleware (see proxy.ts) and
// self-guarded with CRON_SECRET, because Vercel Cron carries no session.
//
// Each run renders a PDF + chart with headless Chromium, so the batch is capped:
// leftovers stay due and are picked up by the next tick (cron runs every 15 min).
export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_LIMIT = 5

function isAuthorized(req: NextRequest, userId: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
    if (bearer === cronSecret) return true
    if (req.headers.get('x-cron-secret') === cronSecret) return true
  }
  // Signed-in users may trigger a sweep manually (same rule as the sync cron).
  return !!userId
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null }))
  if (!isAuthorized(req, userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const startedAt = Date.now()
  try {
    const { connectDB } = await import('@easybim/db')
    const ReportSchedule = (await import('@/app/models/ReportSchedule')).default
    await connectDB()

    const due = await ReportSchedule.find({ active: true, nextRunAt: { $lte: new Date() } })
      .sort({ nextRunAt: 1 })
      .limit(BATCH_LIMIT)

    const results: Array<Record<string, unknown>> = []
    for (const doc of due) {
      // rearm: true — the cadence moves on whatever the outcome, so a broken
      // schedule retries at its next slot instead of every tick.
      const result = await recordRun(doc, { rearm: true })
      results.push({
        scheduleId: String(doc._id),
        name: doc.name,
        projectId: String(doc.projectId),
        status: result.status,
        error: result.error,
        reportId: result.reportId,
        recipients: result.recipients,
        issueCount: result.issueCount,
        nextRunAt: doc.nextRunAt,
      })
    }

    const remaining = await ReportSchedule.countDocuments({ active: true, nextRunAt: { $lte: new Date() } })

    return NextResponse.json({
      ran: results.length,
      remaining,
      elapsedMs: Date.now() - startedAt,
      results,
    })
  } catch (err) {
    console.error('[cron report-schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
