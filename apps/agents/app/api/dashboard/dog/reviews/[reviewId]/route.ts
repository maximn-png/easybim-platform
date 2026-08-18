import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { deleteReview, getReview, toDTO, updateIssues } from '@/lib/agents/dog/review'
import { FindingVerdict, ReviewIssue } from '@/lib/models/AgreementReview'

export const runtime = 'nodejs'

// GET — one review, with its findings.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reviewId } = await params
  const review = await getReview(reviewId)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ review: toDTO(review) })
}

// PATCH { issues, verdicts? } — save the edited findings, and on a follow-up
// round the verdict rows too. The frozen model output is kept separately, so the
// edits stay available as the learning signal.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reviewId } = await params
  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body?.issues))
    return NextResponse.json({ error: 'issues array is required' }, { status: 400 })

  const verdicts = Array.isArray(body?.verdicts) ? (body.verdicts as FindingVerdict[]) : undefined
  const review = await updateIssues(reviewId, body.issues as ReviewIssue[], verdicts)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ review: toDTO(review) })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reviewId } = await params
  const ok = await deleteReview(reviewId)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
