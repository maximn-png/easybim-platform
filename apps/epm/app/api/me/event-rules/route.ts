import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { normalizeTitleKey } from '@/lib/eventMatch'

export const runtime = 'nodejs'

// POST /api/me/event-rules
// Body: { title, projects: [{ projectKey, projectName, projectNumber? }] }
// "For all future meetings": remembers which project(s) a meeting title maps
// to, overriding the heuristic matcher for every future event with that title.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { title?: string; projects?: Array<{ projectKey?: string; projectName?: string; projectNumber?: string }> } | null
  const title = (body?.title ?? '').trim()
  const projects = (body?.projects ?? [])
    .filter((p) => p.projectKey && p.projectName)
    .map((p) => ({ projectKey: p.projectKey!, projectName: p.projectName!, projectNumber: p.projectNumber ?? '' }))

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (projects.length === 0) return NextResponse.json({ error: 'at least one project is required' }, { status: 400 })
  const titleKey = normalizeTitleKey(title)
  if (!titleKey) return NextResponse.json({ error: 'title has no matchable content' }, { status: 400 })

  if (!process.env.MONGODB_URI) return NextResponse.json({ ok: true, mock: true })

  try {
    const { connectDB } = await import('@easybim/db')
    const MeetingRule = (await import('@/app/models/MeetingRule')).default
    await connectDB()

    await MeetingRule.findOneAndUpdate(
      { userId, titleKey },
      { $set: { title, projects } },
      { upsert: true, runValidators: true }
    )
    return NextResponse.json({ ok: true, titleKey })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/me/event-rules]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
