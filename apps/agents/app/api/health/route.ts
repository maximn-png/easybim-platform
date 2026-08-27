import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'

export const dynamic = 'force-dynamic'

type Check = { ok: boolean; detail: string }

async function check(fn: () => Promise<string>): Promise<Check> {
  try {
    return { ok: true, detail: await fn() }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

// GET /api/health — integration probe (pattern: apps/finance/app/api/health).
// Public (see proxy.ts); consumed by the portal admin Integrations board.
// The Anthropic check is key-presence ONLY — never a billable model call.
export async function GET() {
  const [clerk, mongo, monday, anthropic] = await Promise.all([
    check(async () => {
      const pub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      const secret = process.env.CLERK_SECRET_KEY
      if (!pub || !secret) throw new Error('Clerk keys missing')
      return `keys present (${pub.startsWith('pk_live') ? 'live' : 'test'})`
    }),
    check(async () => {
      await connectDB()
      const mongoose = (await import('mongoose')).default
      return `connected to "${mongoose.connection.name}"`
    }),
    check(async () => {
      const token = process.env.MONDAY_API_TOKEN
      if (!token) throw new Error('MONDAY_API_TOKEN missing')
      const res = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2024-10' },
        body: JSON.stringify({ query: 'query { me { name } }' }),
      })
      if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`)
      const json = await res.json() as { data?: { me?: { name?: string } }; errors?: { message: string }[] }
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
      return `authenticated as ${json.data?.me?.name ?? 'unknown'}`
    }),
    check(async () => {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing')
      return 'key present'
    }),
  ])

  const checks = { clerk, mongo, monday, anthropic }
  const ok = Object.values(checks).every((c) => c.ok)

  return NextResponse.json({ ok, app: 'agents', checks }, { status: ok ? 200 : 503 })
}
