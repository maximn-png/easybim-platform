import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

// POST /api/me/task-update
// Body: { boardId, itemId, columnId, value }
// Writes one simple column value (status label / priority label / YYYY-MM-DD
// date) back to a Monday item, from the My Space tasks card.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { boardId?: string; itemId?: string; columnId?: string; value?: string } | null
  const boardId = (body?.boardId ?? '').trim()
  const itemId = (body?.itemId ?? '').trim()
  const columnId = (body?.columnId ?? '').trim()
  const value = (body?.value ?? '').trim()

  if (!boardId || !itemId || !columnId || !value) {
    return NextResponse.json({ error: 'boardId, itemId, columnId and value are required' }, { status: 400 })
  }
  if (!process.env.MONDAY_API_TOKEN) return NextResponse.json({ ok: true, mock: true })

  try {
    const { setMondayItemStatus } = await import('@/lib/services/mondayService')
    await setMondayItemStatus(boardId, itemId, columnId, value)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/me/task-update]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
