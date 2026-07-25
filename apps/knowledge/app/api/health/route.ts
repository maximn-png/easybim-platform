import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import { mondayQuery } from '@/lib/integrations/monday'
import { getDrive } from '@/lib/integrations/gdrive'

export const dynamic = 'force-dynamic'

type Check = { ok: boolean; detail: string }

async function check(fn: () => Promise<string>): Promise<Check> {
  try {
    return { ok: true, detail: await fn() }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

// GET /api/health — confirms each integration is wired via .env.local.
// Public (see proxy.ts) so a dev can run it before signing in.
export async function GET() {
  const [clerk, mongo, monday, gdrive] = await Promise.all([
    check(async () => {
      const pub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      const secret = process.env.CLERK_SECRET_KEY
      if (!pub || !secret) throw new Error('Clerk keys missing')
      return `keys present (${pub.startsWith('pk_live') ? 'live' : 'test'})`
    }),
    check(async () => {
      const conn = await connectDB()
      return `connected to "${conn.connection.name}"`
    }),
    check(async () => {
      const data = await mondayQuery<{ me: { name: string } }>(
        `query { me { name } }`
      )
      return `authenticated as ${data.me.name}`
    }),
    check(async () => {
      const drive = getDrive()
      const res = await drive.about.get({ fields: 'user' })
      return `authenticated as ${res.data.user?.emailAddress ?? 'unknown'}`
    }),
  ])

  const checks = { clerk, mongo, monday, gdrive }
  const ok = Object.values(checks).every((c) => c.ok)

  return NextResponse.json({ ok, app: 'knowledge', checks }, { status: ok ? 200 : 503 })
}
