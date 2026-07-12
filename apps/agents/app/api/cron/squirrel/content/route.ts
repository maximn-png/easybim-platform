import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import { syncQuoteContent } from '@/lib/agents/squirrel/contentSync'

export const runtime = 'nodejs'
export const maxDuration = 300

// Nightly Drive→Mongo content sync (see vercel.json). Secured by CRON_SECRET:
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the env var is set.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()
  const run = await AgentRun.create({
    agentKey: 'squirrel',
    pass: 'content-sync',
    trigger: 'cron',
    status: 'running',
    startedAt: new Date(),
  })

  try {
    // Leave headroom under maxDuration for the wrap-up writes.
    const result = await syncQuoteContent({ timeBudgetMs: 240_000 })
    const summary =
      `content sync: ${result.scanned} scanned — docs +${result.docsUpdated}, sheets +${result.sheetsUpdated}, ` +
      `folders ${result.foldersUpdated}, unchanged ${result.skipped}, failed ${result.failed}` +
      (result.remaining > 0 ? `, remaining ${result.remaining} (continues next night)` : '')

    run.status = 'done'
    run.summary = summary
    run.finishedAt = new Date()
    await run.save()

    return NextResponse.json({ ok: true, runId: String(run._id), ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'content sync failed'
    run.status = 'error'
    run.error = message
    run.finishedAt = new Date()
    await run.save()
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
