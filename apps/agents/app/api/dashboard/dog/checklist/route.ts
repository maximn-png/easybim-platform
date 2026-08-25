import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getChecklist, resetChecklist, updateChecklist } from '@/lib/agents/dog/checklist'
import { ChecklistTopic } from '@/lib/models/ReviewChecklist'

export const runtime = 'nodejs'

// GET — the active checklist (seeded from the seven ported subjects on first read).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const checklist = await getChecklist()
  return NextResponse.json({ checklist })
}

// PUT { topics, ignore } — replace the checklist and bump its version.
export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body?.topics))
    return NextResponse.json({ error: 'topics array is required' }, { status: 400 })

  const topics = (body.topics as ChecklistTopic[]).map((t) => ({
    title: String(t?.title ?? '').trim(),
    detail: String(t?.detail ?? '').trim(),
  }))
  if (topics.every((t) => !t.title))
    return NextResponse.json({ error: 'נדרש לפחות נושא אחד לבדיקה' }, { status: 400 })

  const ignore = Array.isArray(body?.ignore) ? (body.ignore as unknown[]).map(String) : []
  const checklist = await updateChecklist(topics, ignore, userId)
  return NextResponse.json({ checklist })
}

// POST — restore the seven seeded subjects.
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const checklist = await resetChecklist(userId)
  return NextResponse.json({ checklist })
}
