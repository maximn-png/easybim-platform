import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// GET    /api/projects/[id]/syncguard/runs/[runId] — one run with its console.
// DELETE /api/projects/[id]/syncguard/runs/[runId] — cancel a run not yet started.
//
// The dashboard polls GET while a run is live (the Automation page's console).
// `since` returns only newer log lines so a long run's poll stays cheap.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.MONGODB_URI) return NextResponse.json({ unsupported: true })

  const { id, runId } = await params
  const { connectDB } = await import('@easybim/db')
  const SyncguardRun = (await import('@/app/models/SyncguardRun')).default
  await connectDB()

  const run = await SyncguardRun.findOne({ _id: runId, projectId: id }).lean()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const sinceParam = req.nextUrl.searchParams.get('since')
  const since = sinceParam ? new Date(sinceParam) : null
  const log = (run.log ?? [])
    .filter(l => !since || new Date(l.at) > since)
    .map(l => ({ at: new Date(l.at).toISOString(), level: l.level, text: l.text }))

  return NextResponse.json({
    runId: String(run._id),
    modelName: run.modelName,
    agentId: run.agentId,
    status: run.status,
    trigger: run.trigger,
    triggeredBy: run.triggeredBy ?? null,
    attentionReason: run.attentionReason ?? null,
    revitVersion: run.revitVersion ?? null,
    steps: (run.steps ?? []).map(s => ({
      key: s.key, label: s.label, status: s.status, message: s.message ?? null,
      startedAt: s.startedAt ?? null, finishedAt: s.finishedAt ?? null,
    })),
    log,
    // Cursor for the next poll — the newest line we just returned.
    logCursor: log.length ? log[log.length - 1].at : sinceParam,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    durationMs: run.durationMs ?? null,
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.MONGODB_URI) return NextResponse.json({ unsupported: true })

  const { id, runId } = await params
  const { connectDB } = await import('@easybim/db')
  const SyncguardRun = (await import('@/app/models/SyncguardRun')).default
  await connectDB()

  // Only a run no agent has picked up can be withdrawn cleanly. Once Revit is
  // open, cancelling from here would leave a half-synced model — the agent's own
  // timeout is what ends those.
  const run = await SyncguardRun.findOneAndUpdate(
    { _id: runId, projectId: id, status: 'queued' },
    {
      $set: { status: 'cancelled', finishedAt: new Date() },
      $push: { log: { at: new Date(), level: 'info', text: 'Cancelled before it started' } },
    },
    { new: true },
  )
  if (!run) {
    return NextResponse.json(
      { error: 'Only a run that has not started can be cancelled' }, { status: 409 })
  }
  return NextResponse.json({ ok: true, status: run.status })
}
