import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { logCardOpen } from '@easybim/db'
import { CARDS } from '@/lib/cards'

// Beacon target for dashboard card clicks. Best-effort: failures must never
// surface to the user, so all errors collapse to a quiet 2xx/4xx.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new NextResponse(null, { status: 401 })

  const body = await req.json().catch(() => null)
  const app = typeof body?.app === 'string' ? body.app : ''
  if (!CARDS.some((c) => c.id === app)) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    await logCardOpen(userId, app)
  } catch (err) {
    console.error('[track/card-open] failed:', err)
  }
  return new NextResponse(null, { status: 204 })
}
