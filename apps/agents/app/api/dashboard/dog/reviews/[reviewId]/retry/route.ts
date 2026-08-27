import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { deleteReview, getReview, startReview, toDTO } from '@/lib/agents/dog/review'
import { startFollowup } from '@/lib/agents/dog/followup'

export const runtime = 'nodejs'
export const maxDuration = 300

/** An 'analyzing' this old is a serverless function that died mid-run, not a live one. */
const STALE_ANALYZING_MS = 5 * 60 * 1000

// POST — re-run a dead review (errored, or stuck in 'analyzing' after its
// function died). Lives on the server because the DTO deliberately carries file
// names, not fileIds. The dead review is deleted before the re-run — safe, it
// has no findings and no child rounds — and the caller gets the fresh one.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reviewId } = await params
  const review = await getReview(reviewId)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stuck =
    review.status === 'analyzing' &&
    Date.now() - new Date(review.updatedAt).getTime() > STALE_ANALYZING_MS
  if (review.status !== 'error' && !stuck)
    return NextResponse.json({ error: 'אפשר להריץ שוב רק בדיקה שנכשלה או נתקעה' }, { status: 400 })

  // Capture everything before the delete — the doc is gone once we re-run.
  const args =
    review.round > 1
      ? {
          kind: 'followup' as const,
          parentReviewId: review.parentReviewId!,
          newVersionFileId: review.agreement.fileId,
          previousVersionFileId: review.previousAgreement?.fileId ?? '',
        }
      : {
          kind: 'review' as const,
          projectFolderId: review.projectFolderId,
          projectName: review.projectName,
          agreementFileId: review.agreement.fileId,
          quoteFileId: review.quote.fileId,
          previous: (review.previousContracts ?? []).map((p) => ({
            fileId: p.fileId,
            projectLabel: p.projectLabel,
          })),
        }

  await deleteReview(reviewId)

  try {
    const fresh =
      args.kind === 'followup'
        ? await startFollowup({ ...args, userId })
        : await startReview({ ...args, userId })
    return NextResponse.json({ review: toDTO(fresh) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ההרצה החוזרת נכשלה'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
