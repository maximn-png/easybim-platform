import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { HoursTeam } from '@/lib/types'

const VALID_TEAMS: HoursTeam[] = ['modelMgmt', 'superposition', 'none']

// Saves the per-project Subject → team mapping used by the Hours Analytics page.
// Stored under hoursConfig.subjectTeam so the hourly project sync (which only
// $sets snapshot.*/externalIds.* fields) never overwrites it.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null) as { subjectTeam?: Record<string, string> } | null
  const raw = body?.subjectTeam
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'subjectTeam object is required' }, { status: 400 })
  }

  // Sanitise: keep only valid team values; drop 'none' entries to keep the doc lean
  // (an absent subject already defaults to 'none').
  const subjectTeam: Record<string, HoursTeam> = {}
  for (const [subject, team] of Object.entries(raw)) {
    if (!subject) continue
    if (!VALID_TEAMS.includes(team as HoursTeam)) continue
    if (team === 'none') continue
    subjectTeam[subject] = team as HoursTeam
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ ok: true, mock: true, subjectTeam })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const doc = await Project.findByIdAndUpdate(
      id,
      { $set: { 'hoursConfig.subjectTeam': subjectTeam } },
      { new: true }
    ).lean() as Record<string, unknown> | null

    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    return NextResponse.json({ ok: true, subjectTeam })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[PATCH /api/projects/[id]/hours-config]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
