import { NextRequest, NextResponse } from 'next/server'
import { mintToken, hashToken, codesMatch } from '@/lib/server/syncguardAuth'

// POST /api/syncguard/agent/enroll — the workstation redeems a pairing code.
//
// No Clerk session here: this is the one agent endpoint that runs before the
// agent has a token. The code is the credential, it is single-use, short-lived,
// and was created by a signed-in user (see /api/syncguard/enroll), which is what
// binds the machine to an owner.
export async function POST(req: NextRequest) {
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Unavailable' }, { status: 503 })

  const body = await req.json().catch(() => ({})) as {
    code?: string
    agentId?: string
    machineName?: string
    revitVersions?: string[]
    agentVersion?: string
  }
  const code = (body.code ?? '').trim().toUpperCase()
  if (!code || !body.agentId) {
    return NextResponse.json({ error: 'code and agentId are required' }, { status: 400 })
  }

  const { connectDB } = await import('@easybim/db')
  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  await connectDB()

  // Fetch by code, then compare in constant time — a direct query on the code is
  // fine (it's indexed and unique) but the equality check below is what decides.
  const pending = await SyncguardAgent.findOne({ pairingCode: code, enrolled: false })
  if (!pending || !pending.pairingCode || !codesMatch(pending.pairingCode, code)) {
    return NextResponse.json({ error: 'Invalid or already-used pairing code' }, { status: 401 })
  }
  if (pending.pairingExpiresAt && pending.pairingExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Pairing code expired — generate a new one' }, { status: 401 })
  }

  const token = mintToken()
  pending.agentId          = body.agentId
  pending.machineName      = (body.machineName ?? '').trim() || body.agentId
  pending.revitVersions    = body.revitVersions ?? []
  pending.agentVersion     = body.agentVersion
  pending.tokenHash        = hashToken(token)
  pending.enrolled         = true
  pending.pairingCode      = undefined   // single use
  pending.pairingExpiresAt = undefined
  pending.lastHeartbeatAt  = new Date()
  await pending.save()

  // The only time the raw token exists outside the agent's own disk.
  return NextResponse.json({
    token,
    agentId: pending.agentId,
    machineName: pending.machineName,
    kind: pending.kind,
  })
}
