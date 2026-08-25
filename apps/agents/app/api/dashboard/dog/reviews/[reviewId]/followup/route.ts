import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { agendaFor, startFollowup } from '@/lib/agents/dog/followup'
import { getReview, toDTO } from '@/lib/agents/dog/review'
import { contractCandidates } from '@/lib/agents/dog/drive'

export const runtime = 'nodejs'
export const maxDuration = 300 // both contract versions go to the model (~2-4 min)

// GET — what a follow-up round would check, and which files could be the new
// version. Used to populate the picker before anything runs.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reviewId } = await params
  const review = await getReview(reviewId)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const slot = await contractCandidates(review.projectFolderId)
    return NextResponse.json({
      agendaCount: agendaFor(review).length,
      // The file this round reviewed: the default "previous version", and never
      // offered as the new one.
      currentFileId: review.agreement?.fileId ?? null,
      currentFileName: review.agreement?.name ?? null,
      // Every readable document in the contract folder — the user picks both
      // sides of the comparison, so nothing is filtered out of this list.
      candidates: slot.candidates,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST { newVersionFileId, previousVersionFileId? } — check the revised contract
// against the comments we sent, and record it as the next round.
// `previousVersionFileId` is the user's choice of what to compare against:
// omitted → the version this round reviewed; "" → don't attach one at all.
export async function POST(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reviewId } = await params
  const body = await req.json().catch(() => ({}))
  const newVersionFileId = (body?.newVersionFileId ?? '').toString().trim()
  if (!newVersionFileId)
    return NextResponse.json({ error: 'יש לבחור את הגרסה המתוקנת של ההסכם' }, { status: 400 })

  const previousVersionFileId =
    body?.previousVersionFileId === undefined ? undefined : String(body.previousVersionFileId).trim()

  try {
    const review = await startFollowup({
      parentReviewId: reviewId,
      newVersionFileId,
      previousVersionFileId,
      userId,
    })
    return NextResponse.json({ review: toDTO(review) }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'בדיקת הגרסה נכשלה'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
