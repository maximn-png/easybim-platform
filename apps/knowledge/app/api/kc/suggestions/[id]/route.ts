import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Suggestion from '@/lib/models/Suggestion'

// DELETE /api/kc/suggestions/:id — the author withdrawing their own still-
// pending proposal (KC.cancelProposal). Anyone else's suggestion can only
// be resolved (approve/reject), never deleted outright — see
// /api/kc/suggestions/[id]/resolve.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await connectDB()
  const doc = await Suggestion.findById(id)
  if (!doc || doc.status !== 'pending') {
    return NextResponse.json({ ok: true }) // already gone/resolved — withdrawing is a no-op
  }
  if (doc.authorUserId !== userId) {
    return NextResponse.json({ error: 'Only the author can withdraw this' }, { status: 403 })
  }
  await doc.deleteOne()
  return NextResponse.json({ ok: true })
}
