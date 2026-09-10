import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { buildClientAnalytics, PARTIES, type PartyKey } from '@/lib/agents/squirrel/clients'

export const runtime = 'nodejs'
export const maxDuration = 60

const PARTY_KEYS = new Set(PARTIES.map((p) => p.key))

// GET /api/dashboard/squirrel/clients?party=developer&sinceMonths=24
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const raw = params.get('party') ?? 'developer'
  const party = (PARTY_KEYS.has(raw as PartyKey) ? raw : 'developer') as PartyKey
  const since = Number(params.get('sinceMonths'))

  try {
    const data = await buildClientAnalytics({
      party,
      sinceMonths: Number.isFinite(since) && since > 0 ? since : undefined,
    })
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to build client analytics'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
