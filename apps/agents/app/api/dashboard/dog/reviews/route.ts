import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { MAX_PREVIOUS_CONTRACTS, listReviews, startReview, toDTO } from '@/lib/agents/dog/review'

export const runtime = 'nodejs'
export const maxDuration = 300 // one Opus pass over two documents (~1-2 min)

// GET /api/dashboard/dog/reviews — the review list (findings omitted; the drawer fetches them).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const reviews = await listReviews()
  return NextResponse.json({ reviews })
}

// POST /api/dashboard/dog/reviews — run a review. Body: the project and the two
// files the user confirmed. Nothing is inferred here; the picker already resolved them.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const projectFolderId = (body?.projectFolderId ?? '').toString().trim()
  const projectName = (body?.projectName ?? '').toString().trim()
  const agreementFileId = (body?.agreementFileId ?? '').toString().trim()
  const quoteFileId = (body?.quoteFileId ?? '').toString().trim()

  if (!projectFolderId || !projectName)
    return NextResponse.json({ error: 'יש לבחור תיקיית פרויקט' }, { status: 400 })
  if (!agreementFileId) return NextResponse.json({ error: 'יש לבחור את קובץ ההסכם' }, { status: 400 })
  if (!quoteFileId) return NextResponse.json({ error: 'יש לבחור את קובץ הצעת המחיר' }, { status: 400 })

  // Optional comparison against contracts already signed with this client.
  const previous = (Array.isArray(body?.previous) ? body.previous : [])
    .map((p: { fileId?: unknown; projectLabel?: unknown }) => ({
      fileId: String(p?.fileId ?? '').trim(),
      projectLabel: String(p?.projectLabel ?? '').trim(),
    }))
    .filter((p: { fileId: string }) => p.fileId)
    .slice(0, MAX_PREVIOUS_CONTRACTS)

  try {
    const review = await startReview({
      projectFolderId,
      projectName,
      agreementFileId,
      quoteFileId,
      previous,
      userId,
    })
    return NextResponse.json({ review: toDTO(review) }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'הבדיקה נכשלה'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
