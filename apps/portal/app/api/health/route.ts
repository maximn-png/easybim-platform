import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { connectDB } from '@easybim/db'

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
// Public (see proxy.ts); consumed by the admin Integrations board.
export async function GET() {
  const [clerk, mongo] = await Promise.all([
    check(async () => {
      const pub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      const secret = process.env.CLERK_SECRET_KEY
      if (!pub || !secret) throw new Error('Clerk keys missing')
      const count = await (await clerkClient()).users.getCount()
      return `${count} users (${pub.startsWith('pk_live') ? 'live' : 'test'})`
    }),
    check(async () => {
      await connectDB()
      const mongoose = (await import('mongoose')).default
      return `connected to "${mongoose.connection.name}"`
    }),
  ])

  const checks = { clerk, mongo }
  const ok = Object.values(checks).every((c) => c.ok)

  return NextResponse.json({ ok, app: 'portal', checks }, { status: ok ? 200 : 503 })
}
