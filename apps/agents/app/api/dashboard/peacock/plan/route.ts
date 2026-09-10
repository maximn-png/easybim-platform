import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getContentPlan, saveContentPlan, normalizePlan } from '@/lib/agents/peacock/plan'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/plan — the saved content plan (cadence + pillars).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await getContentPlan()
  return NextResponse.json({ plan })
}

// PUT /api/dashboard/peacock/plan — replace it.
//
// The body is normalized rather than validated-and-rejected: the only caller is
// the dashboard's own stepper and chips, and clamping a stray value is friendlier
// than a 400 the card would have to render. postsPerWeek=0 is a legitimate
// setting (autopilot off), so it must survive normalization — hence the explicit
// floor of 0 rather than a truthiness check anywhere on this path.
export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const plan = await saveContentPlan(normalizePlan(body?.plan ?? body), userId)
  return NextResponse.json({ plan })
}
