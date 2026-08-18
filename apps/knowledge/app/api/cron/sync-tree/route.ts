import { NextRequest, NextResponse } from 'next/server'
import { syncMondayTree } from '@/lib/kc/mondaySync'

export const runtime = 'nodejs'
export const maxDuration = 300

// Vercel Cron hits this daily (see vercel.json). Secured by CRON_SECRET:
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the env var is
// set — same pattern as apps/agents' cron routes.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncMondayTree()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
