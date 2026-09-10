import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// GET /api/syncguard/agents — the target-computer picker's options.
//
// A user sees their OWN personal agents plus every shared agent: a personal
// machine is only ever a Run Now target for its owner, while a shared
// workstation is team infrastructure and the only valid scheduled target.
//
// `online` is derived, not stored — an agent that stopped heartbeating is
// offline whether or not it shut down cleanly. `blockedReason` is the
// enqueue-time refusal, surfaced here so the UI can disable an option and say
// why instead of letting the run fail minutes later.
const ONLINE_WINDOW_MS = 5 * 60_000

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.MONGODB_URI) return NextResponse.json({ agents: [] })

  const { connectDB } = await import('@easybim/db')
  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  await connectDB()

  const rows = await SyncguardAgent.find({
    enrolled: true,
    $or: [{ kind: 'shared' }, { kind: 'personal', ownerUserId: userId }],
  }).sort({ kind: 1, machineName: 1 }).lean()

  const now = Date.now()
  const agents = rows.map(a => {
    const lastHeartbeatAt = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt) : null
    const online = !!lastHeartbeatAt && now - lastHeartbeatAt.getTime() < ONLINE_WINDOW_MS

    // Kept in step with the enqueue refusal in
    // app/api/projects/[id]/syncguard/runs/route.ts — a machine that would be
    // refused there must look unavailable here, or the user only finds out on
    // click. `revitRunning` blocks regardless of WHICH model is open: a second
    // Revit cannot obtain a licence, so the run dies before the script loads.
    const blockedReason =
      !a.enabled            ? 'Disabled by an administrator'
      : !online             ? 'Offline — the machine is off or the agent is not running'
      : !a.autodeskSignedIn ? 'Needs Autodesk sign-in on that machine'
      : a.currentRunId      ? 'Already running a Syncguard job'
      : a.revitRunning      ? 'Revit is open there — close it first (a second Revit cannot get a licence)'
      : null

    return {
      agentId: a.agentId,
      machineName: a.machineName,
      kind: a.kind,
      isMine: a.ownerUserId === userId,
      online,
      lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
      revitVersions: a.revitVersions ?? [],
      autodeskSignedIn: !!a.autodeskSignedIn,
      autodeskUser: a.autodeskUser ?? null,
      revitRunning: !!a.revitRunning,
      openModels: a.openModels ?? [],
      busy: !!a.currentRunId,
      blockedReason,
    }
  })

  return NextResponse.json({ agents })
}
