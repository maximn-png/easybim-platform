import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { mintPairingCode } from '@/lib/server/syncguardAuth'
import { randomUUID } from 'node:crypto'

// POST /api/syncguard/enroll — a signed-in user asks for a pairing code, then
// types it into the agent on the machine they want to register.
//
// The code, not a form field, is what binds machine → owner: whoever redeems it
// becomes an agent owned by this Clerk user. `kind` decides whether it can be a
// scheduled target ('shared') or only a Run Now target ('personal').
const CODE_TTL_MS = 15 * 60_000

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.MONGODB_URI) return NextResponse.json({ unsupported: true })

  const { kind } = await req.json().catch(() => ({})) as { kind?: 'personal' | 'shared' }
  if (kind !== 'personal' && kind !== 'shared') {
    return NextResponse.json({ error: "kind must be 'personal' or 'shared'" }, { status: 400 })
  }

  const { connectDB } = await import('@easybim/db')
  const SyncguardAgent = (await import('@/app/models/SyncguardAgent')).default
  await connectDB()

  // Drop this user's other unredeemed codes of the same kind — a fresh request
  // means the old code was lost, and leaving it live is a needless credential.
  await SyncguardAgent.deleteMany({ ownerUserId: userId, kind, enrolled: false })

  const code = mintPairingCode()
  await SyncguardAgent.create({
    agentId: `pending-${randomUUID()}`,   // replaced by the agent's own id at redemption
    kind,
    ownerUserId: userId,
    enrolled: false,
    pairingCode: code,
    pairingExpiresAt: new Date(Date.now() + CODE_TTL_MS),
  })

  return NextResponse.json({ code, expiresInSeconds: CODE_TTL_MS / 1000 })
}
