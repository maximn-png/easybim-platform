import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/server/syncguardAuth'

// POST /api/syncguard/agent/heartbeat — the agent's liveness + capability report.
//
// Carries more than "I'm alive": Autodesk sign-in state, whether a human has
// Revit open, and which models are open. That lets the UI warn about a lost
// Autodesk session BEFORE a scheduled window instead of discovering it as a
// 07:00 failure, and lets an enqueue refuse up front when Revit is already open
// on the target model (docs/SYNCGUARD_PLAN.md).
//
// Returns hasWork so a quiet agent can back off its poll interval.
export async function POST(req: NextRequest) {
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Unavailable' }, { status: 503 })

  const { connectDB } = await import('@easybim/db')
  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  const SyncguardRun = (await import('@/app/models/SyncguardRun')).default
  await connectDB()

  const agent = await authenticateAgent(req, SyncguardAgent)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    revitVersions?: string[]
    autodeskSignedIn?: boolean
    autodeskUser?: string
    revitRunning?: boolean
    openModels?: string[]
    agentVersion?: string
  }

  if (Array.isArray(body.revitVersions)) agent.revitVersions = body.revitVersions
  if (typeof body.autodeskSignedIn === 'boolean') agent.autodeskSignedIn = body.autodeskSignedIn
  if (typeof body.revitRunning === 'boolean') agent.revitRunning = body.revitRunning
  if (Array.isArray(body.openModels)) agent.openModels = body.openModels
  if (body.autodeskUser !== undefined) agent.autodeskUser = body.autodeskUser
  if (body.agentVersion !== undefined) agent.agentVersion = body.agentVersion
  agent.lastHeartbeatAt = new Date()
  await agent.save()

  const hasWork = await SyncguardRun.exists({ agentId: agent.agentId, status: 'queued' })

  return NextResponse.json({
    ok: true,
    hasWork: !!hasWork,
    // Echoed so a re-imaged machine can notice it's been disabled or re-kinded.
    kind: agent.kind,
    enabled: agent.enabled,
  })
}
