import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getReview, toDTO } from '@/lib/agents/dog/review'
import { runVerification } from '@/lib/agents/dog/verify'

export const runtime = 'nodejs'
// A full read of the agreement — minutes, not seconds. Its own request so it
// never stacks on the analysis run's budget.
export const maxDuration = 300

/** A 'running' this old is a serverless function that died mid-verify, not a live run. */
const STALE_RUNNING_MS = 6 * 60 * 1000

// POST { force? } — run the evidence-verification pass on a finished review.
// Normally fired once by the drawer when verifyStatus is 'pending'; `force`
// re-runs after an error (or re-audits a done review).
export async function POST(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reviewId } = await params
  const body = await req.json().catch(() => ({}))
  const force = !!body?.force

  const review = await getReview(reviewId)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (review.status !== 'ready')
    return NextResponse.json({ error: 'אפשר לאמת רק בדיקה שהסתיימה' }, { status: 400 })

  const vs = review.verifyStatus
  const staleRunning =
    vs === 'running' && Date.now() - new Date(review.updatedAt).getTime() > STALE_RUNNING_MS
  const allowed = vs === 'pending' || (vs === 'running' && staleRunning) || (force && vs !== 'running')
  if (!allowed) {
    const error = vs === 'running' ? 'האימות כבר רץ' : 'האימות כבר הושלם לבדיקה הזו'
    return NextResponse.json({ error }, { status: 409 })
  }

  try {
    const updated = await runVerification(reviewId)
    return NextResponse.json({ review: toDTO(updated) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'האימות נכשל'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
