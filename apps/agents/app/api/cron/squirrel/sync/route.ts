import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import { syncFromMonday, backfillAreas } from '@/lib/agents/squirrel/quoteIndex'

export const runtime = 'nodejs'
export const maxDuration = 300

// Vercel Cron hits this daily (see vercel.json). Secured by CRON_SECRET:
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the env var is set.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// Backfill up to this many missing areas per run (each is a Sheets read); converges over days.
const AREA_BATCH = 60

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()
  const run = await AgentRun.create({
    agentKey: 'squirrel',
    pass: 'sync',
    trigger: 'cron',
    status: 'running',
    startedAt: new Date(),
  })

  try {
    const sync = await syncFromMonday()
    const areas = await backfillAreas(AREA_BATCH)
    const summary = `index sync: ${sync.total} quotes upserted; areas +${areas.updated}/${areas.scanned} scanned`

    run.status = 'done'
    run.summary = summary
    run.finishedAt = new Date()
    await run.save()

    return NextResponse.json({ ok: true, runId: String(run._id), ...sync, areas })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed'
    run.status = 'error'
    run.error = message
    run.finishedAt = new Date()
    await run.save()
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
