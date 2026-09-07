import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/server/syncguardAuth'

// POST /api/syncguard/agent/runs/[runId]/log — stream progress from the workstation.
//
// Accepts a batch of lines and/or a step transition, so the agent can forward
// whatever `pyrevit run` wrote to stdout without a request per line. Every call
// also bumps lastProgressAt, which is what the claim endpoint's watchdog uses to
// tell "still working" from "died holding the run".
//
// The log is capped server-side: a Revit run that goes haywire can emit
// thousands of lines, and the run document must not grow without bound.
const MAX_LOG_LINES = 500

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Unavailable' }, { status: 503 })

  const { connectDB } = await import('@easybim/db')
  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  const runMod = await import('@/app/models/SyncguardRun')
  const SyncguardRun = runMod.default
  const { TERMINAL_STATUSES } = runMod
  await connectDB()

  const agent = await authenticateAgent(req, SyncguardAgent)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const body = await req.json().catch(() => ({})) as {
    lines?: { level?: 'info' | 'warn' | 'error'; text: string }[]
    step?: { key: string; status: 'running' | 'done' | 'skipped' | 'failed'; message?: string }
  }

  // Scoped to this agent: an agent can only ever write to its own run.
  const run = await SyncguardRun.findOne({ _id: runId, agentId: agent.agentId })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (TERMINAL_STATUSES.includes(run.status)) {
    return NextResponse.json({ error: `Run already ${run.status}` }, { status: 409 })
  }

  const now = new Date()

  for (const l of body.lines ?? []) {
    if (!l?.text) continue
    run.log.push({ at: now, level: l.level ?? 'info', text: String(l.text).slice(0, 2000) })
  }
  if (run.log.length > MAX_LOG_LINES) {
    const dropped = run.log.length - MAX_LOG_LINES
    run.log = run.log.slice(-MAX_LOG_LINES)
    run.log[0] = { at: now, level: 'info', text: `… ${dropped} earlier lines trimmed` }
  }

  if (body.step) {
    const step = run.steps.find(s => s.key === body.step!.key)
    if (step) {
      step.status = body.step.status
      if (body.step.message) step.message = body.step.message
      if (body.step.status === 'running') step.startedAt = now
      else step.finishedAt = now
    }
  }

  // First sign of real work moves the run out of 'claimed'.
  if (run.status === 'claimed') {
    run.status = 'running'
    run.startedAt = run.startedAt ?? now
  }
  run.lastProgressAt = now
  await run.save()

  return NextResponse.json({ ok: true })
}
