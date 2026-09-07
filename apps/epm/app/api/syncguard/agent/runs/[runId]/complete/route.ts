import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/server/syncguardAuth'

// POST /api/syncguard/agent/runs/[runId]/complete — terminal report from the agent.
//
// The agent reports the Revit side only. 'needs_attention' is its own outcome
// rather than a flavour of failure: a missing required parameter on Forma or a
// lost Autodesk sign-in will fail identically on every retry until a person
// acts, so the UI must offer Resolve instead of Run Again.
import type { SyncguardStatus } from '@/app/models/SyncguardRun'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Unavailable' }, { status: 503 })

  const { connectDB } = await import('@easybim/db')
  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  const runMod = await import('@/app/models/SyncguardRun')
  const SyncguardRun = runMod.default
  const { AGENT_OUTCOMES, TERMINAL_STATUSES } = runMod
  await connectDB()

  const agent = await authenticateAgent(req, SyncguardAgent)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await params
  const body = await req.json().catch(() => ({})) as {
    status?: SyncguardStatus
    attentionReason?: string
    lines?: { level?: 'info' | 'warn' | 'error'; text: string }[]
  }
  if (!body.status || !AGENT_OUTCOMES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of ${AGENT_OUTCOMES.join(', ')}` }, { status: 400 })
  }

  const run = await SyncguardRun.findOne({ _id: runId, agentId: agent.agentId })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  // A retried complete (flaky network on the workstation) must not rewrite the
  // outcome or the duration of a run that already finished.
  if (TERMINAL_STATUSES.includes(run.status)) {
    return NextResponse.json({ error: `Run already ${run.status}`, status: run.status }, { status: 409 })
  }

  const now = new Date()
  for (const l of body.lines ?? []) {
    if (l?.text) run.log.push({ at: now, level: l.level ?? 'info', text: String(l.text).slice(0, 2000) })
  }

  run.status = body.status
  if (body.attentionReason) run.attentionReason = body.attentionReason.slice(0, 500)
  run.finishedAt = now
  run.lastProgressAt = now
  run.durationMs = now.getTime() - (run.startedAt ?? run.claimedAt ?? now).getTime()

  // Any step left mid-flight when the run ends would otherwise spin forever in
  // the UI's step list.
  for (const s of run.steps) {
    if (s.status === 'running') { s.status = body.status === 'success' ? 'done' : 'failed'; s.finishedAt = now }
    else if (s.status === 'pending' && body.status !== 'success') s.status = 'skipped'
  }
  await run.save()

  // Free the machine for the next run regardless of outcome.
  if (String(agent.currentRunId) === String(run._id)) {
    agent.currentRunId = null
    await agent.save()
  }

  return NextResponse.json({ ok: true, status: run.status, durationMs: run.durationMs })
}
