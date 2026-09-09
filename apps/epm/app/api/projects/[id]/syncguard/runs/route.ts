import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveViewerHub } from '@/lib/services/apsHubs'
import { listCoordinationModels, coordCacheKey, type CoordinationModel } from '@/lib/services/apsCoordination'
import { swrCache } from '@/lib/server/pageCache'

// Syncguard runs for one project.
//   POST — enqueue a run on a target agent (all the refuse-early guardrails)
//   GET  — run history for the card
//
// The model's identity is resolved SERVER-side from the cached coordination
// crawl and never taken from the request body: the client sends only an itemId,
// so it cannot point a workstation at arbitrary cloud GUIDs.
const CACHE_TTL_MS = 10 * 60_000
const ONLINE_WINDOW_MS = 5 * 60_000

async function resolveModel(projectDocId: string, itemId: string) {
  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()

  const doc = await Project.findById(projectDocId).select('externalIds').lean() as Record<string, unknown> | null
  if (!doc) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  const ext = (doc.externalIds ?? {}) as Record<string, unknown>
  const accProjectId = ext.accProjectId as string | undefined
  const hub = resolveViewerHub(ext.accHubId as string | undefined, ext.accExternalHub as boolean | undefined)
  if (!hub || !accProjectId) return { error: NextResponse.json({ unsupported: true }) }

  const { data: models } = await swrCache<CoordinationModel[]>(
    coordCacheKey(projectDocId), CACHE_TTL_MS, false,
    () => listCoordinationModels(accProjectId, hub),
  )
  const model = models.find(m => m.itemId === itemId)
  if (!model) return { error: NextResponse.json({ error: 'Model not found for this project' }, { status: 404 }) }

  return { model, accProjectId }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ unsupported: true })

  const { itemId, agentId } = await req.json().catch(() => ({})) as { itemId?: string; agentId?: string }
  if (!itemId || !agentId) {
    return NextResponse.json({ error: 'itemId and agentId are required' }, { status: 400 })
  }

  const resolved = await resolveModel(id, itemId)
  if ('error' in resolved) return resolved.error
  const { model, accProjectId } = resolved

  // A non-cloud model has no central to sync with and no GUIDs to open by.
  if (!model!.workshared || !model!.projectGuid || !model!.modelGuid) {
    return NextResponse.json({
      error: 'This model is not cloud-workshared, so it cannot be synced. Publish is still available.',
    }, { status: 409 })
  }

  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  const SyncguardRunMod = await import('@/app/models/SyncguardRun')
  const SyncguardRun = SyncguardRunMod.default
  const { DEFAULT_STEPS } = SyncguardRunMod

  const agent = await SyncguardAgent.findOne({ agentId, enrolled: true })
  if (!agent) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  // A personal machine is its owner's alone — never a target someone else picks.
  if (agent.kind === 'personal' && agent.ownerUserId !== userId) {
    return NextResponse.json({ error: 'That computer belongs to another user' }, { status: 403 })
  }

  // Refuse early and say why, rather than failing eight minutes into a run.
  const online = !!agent.lastHeartbeatAt && Date.now() - agent.lastHeartbeatAt.getTime() < ONLINE_WINDOW_MS
  const refusal =
    !agent.enabled          ? 'That computer is disabled by an administrator'
    : !online               ? 'That computer is offline — turn it on and make sure the Syncguard agent is running'
    : !agent.autodeskSignedIn ? 'Revit on that computer is not signed in to Autodesk — sign in there first'
    : agent.currentRunId    ? 'That computer is already running a Syncguard job'
    // pyrevit run starts its OWN Revit; if the model is already open there,
    // the sync collides over workset ownership.
    : agent.revitRunning && agent.openModels?.some(m => m && model!.name.toLowerCase().includes(m.toLowerCase()))
        ? `Revit is open with ${model!.name} on that computer — close it first`
    : null
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 })

  // The model's own Revit version beats the project's Monday-sourced rvtVersion.
  if (model!.revitVersion && agent.revitVersions.length &&
      !agent.revitVersions.includes(String(model!.revitVersion))) {
    return NextResponse.json({
      error: `That computer has no Revit ${model!.revitVersion} installed (found ${agent.revitVersions.join(', ')})`,
    }, { status: 409 })
  }

  // One live run per model, whoever asked for it.
  const live = await SyncguardRun.findOne({
    itemId, status: { $in: ['queued', 'claimed', 'running'] },
  }).select('_id agentId status')
  if (live) {
    return NextResponse.json({
      error: 'A Syncguard run for this model is already in progress',
      runId: String(live._id),
    }, { status: 409 })
  }

  const run = await SyncguardRun.create({
    projectId: id,
    agentId: agent.agentId,
    modelName: model!.name,
    itemId,
    accProjectId: accProjectId!,
    projectGuid: model!.projectGuid,
    modelGuid: model!.modelGuid,
    region: model!.region,
    revitVersion: model!.revitVersion,
    trigger: 'manual',
    triggeredBy: userId,
    status: 'queued',
    steps: DEFAULT_STEPS.map(s => ({ ...s })),
    log: [{ at: new Date(), level: 'info', text: `Queued for ${agent.machineName}` }],
  })

  return NextResponse.json({ runId: String(run._id), status: run.status, machineName: agent.machineName })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ runs: [] })

  const { connectDB } = await import('@easybim/db')
  const SyncguardRun = (await import('@/app/models/SyncguardRun')).default
  await connectDB()

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 10, 50)
  const runs = await SyncguardRun.find({ projectId: id })
    .sort({ createdAt: -1 }).limit(limit)
    .select('-log')            // the history list never renders the console
    .lean()

  return NextResponse.json({
    runs: runs.map(r => ({
      runId: String(r._id),
      modelName: r.modelName,
      agentId: r.agentId,
      status: r.status,
      trigger: r.trigger,
      triggeredBy: r.triggeredBy ?? null,
      attentionReason: r.attentionReason ?? null,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt ?? null,
      durationMs: r.durationMs ?? null,
    })),
  })
}
