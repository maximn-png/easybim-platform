import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/server/syncguardAuth'

// POST /api/syncguard/agent/claim — take the next queued run for this agent.
//
// 204 means "nothing for you", which is the common case; the agent should treat
// it as a cue to keep polling slowly rather than an error.
//
// The claim is a single findOneAndUpdate on (agentId, status: 'queued') so two
// processes on the same machine — or a duplicated agent install — can never both
// get the same run. An agent already mid-run is refused outright: one Revit
// automation at a time per machine, or they fight over the model.
const STALE_CLAIM_MS = 45 * 60_000

export async function POST(req: NextRequest) {
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Unavailable' }, { status: 503 })

  const { connectDB } = await import('@easybim/db')
  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  const SyncguardRun = (await import('@/app/models/SyncguardRun')).default
  await connectDB()

  const agent = await authenticateAgent(req, SyncguardAgent)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reap our own abandoned run first (machine rebooted mid-job, Revit hung and
  // the agent died with it) so a crashed run can't wedge the machine forever.
  if (agent.currentRunId) {
    const live = await SyncguardRun.findById(agent.currentRunId).select('status lastProgressAt startedAt')
    const stale = live && ['claimed', 'running'].includes(live.status) &&
      Date.now() - (live.lastProgressAt ?? live.startedAt ?? new Date(0)).getTime() > STALE_CLAIM_MS
    if (!live || !['claimed', 'running'].includes(live.status)) {
      agent.currentRunId = null
      await agent.save()
    } else if (stale) {
      await SyncguardRun.updateOne({ _id: live._id }, {
        $set: { status: 'failed', finishedAt: new Date() },
        $push: { log: { at: new Date(), level: 'error', text: 'Run abandoned — no progress reported; the agent or Revit stopped responding.' } },
      })
      agent.currentRunId = null
      await agent.save()
    } else {
      return NextResponse.json({ error: 'Agent already has a run in progress' }, { status: 409 })
    }
  }

  const now = new Date()
  const run = await SyncguardRun.findOneAndUpdate(
    { agentId: agent.agentId, status: 'queued' },
    { $set: { status: 'claimed', claimedAt: now, lastProgressAt: now } },
    { sort: { createdAt: 1 }, new: true },
  )
  if (!run) return new NextResponse(null, { status: 204 })

  agent.currentRunId = run._id
  await agent.save()

  // Everything the workstation needs to open the model, and nothing else.
  return NextResponse.json({
    runId: String(run._id),
    modelName: run.modelName,
    accProjectId: run.accProjectId,
    itemId: run.itemId,
    projectGuid: run.projectGuid,
    modelGuid: run.modelGuid,
    region: run.region,
    revitVersion: run.revitVersion,
    steps: run.steps.map(s => ({ key: s.key, label: s.label })),
  })
}
