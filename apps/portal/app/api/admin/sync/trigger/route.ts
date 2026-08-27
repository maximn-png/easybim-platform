import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/adminApi'

// Admin Console "Sync Now" — proxies to EPM's sync endpoint with the shared
// cron secret so the console can trigger it cross-app. The EPM sync self-
// budgets its issue-stats pass at ~240s, so allow the full upstream wait.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST() {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const epmUrl = process.env.NEXT_PUBLIC_EPM_URL
  const cronSecret = process.env.CRON_SECRET
  if (!epmUrl || !cronSecret) {
    return NextResponse.json(
      { error: 'Sync trigger not configured (NEXT_PUBLIC_EPM_URL / CRON_SECRET missing)' },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(`${epmUrl}/api/sync/projects`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: 'no-store',
    })
    const body = await res.json().catch(() => ({ error: `EPM sync returned ${res.status}` }))
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `EPM sync unreachable: ${msg}` }, { status: 502 })
  }
}
