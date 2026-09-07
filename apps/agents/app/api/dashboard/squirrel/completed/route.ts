import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { buildCompletedAnalytics, saveSubjectMap, type SubjectMap } from '@/lib/agents/squirrel/completed'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/dashboard/squirrel/completed — the Completed Projects card.
// ?refresh=1 bypasses the 5-minute MA-004 memo; ?type=C filters to one סוג פרויקט.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const types = params.getAll('type').filter(Boolean)
  try {
    const data = await buildCompletedAnalytics({
      refresh: params.get('refresh') === '1',
      projectTypes: types.length ? types : undefined,
    })
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to build completed-project analytics'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH — reassign timesheet Subjects to departments (office-wide, see completed.ts).
export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { subjectDepartment?: SubjectMap } | null
  if (!body?.subjectDepartment || typeof body.subjectDepartment !== 'object') {
    return NextResponse.json({ error: 'subjectDepartment map required' }, { status: 400 })
  }
  const saved = await saveSubjectMap(body.subjectDepartment, userId)
  return NextResponse.json({ ok: true, subjectDepartment: saved })
}
