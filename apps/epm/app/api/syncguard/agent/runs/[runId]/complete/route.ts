import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/server/syncguardAuth'
import { resolveViewerHub, getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import { getApsAccessTokenForUser } from '@/lib/server/apsTokenStore'
import { publishModel } from '@/lib/services/apsPublish'
import type { ISyncguardRun, ISyncguardStep } from '@/app/models/SyncguardRun'
import type { HydratedDocument } from 'mongoose'

/**
 * Step 3 of the pipeline, run here because nobody else can.
 *
 * The workstation agent cannot publish: the ACC commands endpoint rejects
 * service tokens, so publishing needs a 3-legged USER token and the agent holds
 * none. So the platform does it the moment the sync lands, acting as the person
 * who asked for the run — which is exactly what the persisted ApsToken exists
 * for ("background jobs can act on their behalf").
 *
 * Failure here does not undo the sync, so it never turns a good sync into a
 * failure: the run keeps its sync outcome and the publish step carries the
 * reason — except a missing token, which is a human action and therefore
 * needs_attention.
 */
async function publishAfterSync(run: HydratedDocument<ISyncguardRun>, step: ISyncguardStep) {
  const now = new Date()
  const note = (status: ISyncguardStep['status'], message: string) => {
    step.status = status; step.message = message; step.finishedAt = now
    run.log.push({ at: now, level: status === 'failed' ? 'warn' : 'info', text: `Publish: ${message}` })
  }

  // A scheduled run has no requesting user to borrow a token from; Phase 6 must
  // nominate a publisher. Skipping loudly beats publishing as nobody.
  if (!run.triggeredBy) return note('skipped', 'no requesting user to publish as (scheduled run)')

  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()
  const doc = await Project.findById(run.projectId).select('externalIds').lean() as Record<string, unknown> | null
  const ext = (doc?.externalIds ?? {}) as Record<string, unknown>
  const hub = resolveViewerHub(ext.accHubId as string | undefined, ext.accExternalHub as boolean | undefined)
  if (!hub) return note('skipped', 'no publish credentials for this hub')

  // Stored tokens key on the APP that issued them, and the EasyBIM app uses the
  // EMPTY key — so this takes the PARTNER hub (null for our own), never
  // resolveViewerHub's output. Passing the EasyBIM hub object queries
  // hubKey:'easybim', which matches no row, and reports a connected user as
  // disconnected.
  const partnerHub = ext.accExternalHub
    ? getPartnerHubByAccountId(ext.accHubId as string | undefined)
    : null

  const token = await getApsAccessTokenForUser(run.triggeredBy, partnerHub)
  if (!token) {
    note('failed', 'Autodesk not connected for the user who started this run')
    run.status = 'needs_attention'
    run.attentionReason = 'The model synced, but publishing needs Autodesk connected — open the project and connect Autodesk, then publish.'
    return
  }

  try {
    const result = await publishModel(run.accProjectId, run.itemId, token)
    if (result.state === 'published')   return note('done', 'published to ACC — translation continues in ACC')
    if (result.state === 'in-progress') return note('done', result.detail ?? 'ACC was already publishing')
    if (result.state === 'up-to-date')  return note('done', 'already up to date')
    if (result.state === 'unauthorized') {
      note('failed', 'that user lacks publish rights on this project')
      run.status = 'needs_attention'
      run.attentionReason = 'The model synced, but the requesting user cannot publish this ACC project.'
      return
    }
    note('failed', result.detail ?? 'publish failed')
  } catch {
    note('failed', 'publish request failed')
  }
}

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
  // the UI's step list. The publish step is excluded — it has not run yet.
  for (const s of run.steps) {
    if (s.key === 'publish') continue
    if (s.status === 'running') { s.status = body.status === 'success' ? 'done' : 'failed'; s.finishedAt = now }
    else if (s.status === 'pending' && body.status !== 'success') s.status = 'skipped'
  }

  // The sync is what the agent reports; the publish is ours to do, and only
  // when there is something worth publishing.
  const publishStep = run.steps.find(s => s.key === 'publish')
  if (publishStep) {
    if (body.status === 'success' || body.status === 'warning') {
      publishStep.status = 'running'; publishStep.startedAt = now
      await publishAfterSync(run, publishStep)
    } else {
      publishStep.status = 'skipped'
      publishStep.message = 'sync did not succeed'
      publishStep.finishedAt = now
    }
  }
  await run.save()

  // Free the machine for the next run regardless of outcome.
  if (String(agent.currentRunId) === String(run._id)) {
    agent.currentRunId = null
    await agent.save()
  }

  return NextResponse.json({ ok: true, status: run.status, durationMs: run.durationMs })
}
