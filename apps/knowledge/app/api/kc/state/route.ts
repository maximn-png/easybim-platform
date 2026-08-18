import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveAccess, resolveKnowledgeRole } from '@easybim/auth'
import { connectDB } from '@/lib/db/mongoose'
import UserState from '@/lib/models/UserState'
import { hydrateIdentity } from '@/lib/kc/authHelpers'

// GET /api/kc/state — the current user's whole personal-state blob, their
// real, server-resolved Knowledge Center role (set by a portal admin, never
// by the client — see @easybim/auth's resolveKnowledgeRole), and their real
// identity (name/mail/initials, replacing kc-app.js's hardcoded
// DEFAULT_IDENTITY/"Gal Shem Tov" stub). Fetched once at page load by
// kc-api.js's boot-time sync XHR (see RemoteKV).
export async function GET() {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveAccess(userId, sessionClaims)
  const role = resolveKnowledgeRole(access)
  const identity = await hydrateIdentity(userId)

  await connectDB()
  const doc = await UserState.findOne({ userId }).lean()

  return NextResponse.json({ kv: doc?.kv ?? {}, role, identity })
}
