import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveEpmAccess, isAnaProjectDoc } from '@/lib/server/anaAccess'

// PATCH /api/ana/projects/[id]
// Persists the client-editable ANA fields (number / status / projectType) into
// the project's `ana` sub-object. Kept separate from the Monday-driven snapshot
// so the sync never overwrites client edits. Writable by ANA users and internal
// EPM users alike, but only for projects that belong to the ANA hub.
const EDITABLE_KEYS = ['number', 'status', 'projectType'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { hasEpm, hasAna } = await resolveEpmAccess()
  if (!hasEpm && !hasAna) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'No database' }, { status: 503 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Build a $set limited to the whitelisted, string-typed fields.
  const set: Record<string, string> = {}
  for (const key of EDITABLE_KEYS) {
    if (key in body) set[`ana.${key}`] = String(body[key] ?? '').trim()
  }
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const doc = await Project.findById(id).select('externalIds').lean() as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!isAnaProjectDoc(doc)) {
      // Only ANA-hub projects carry these client-editable fields.
      return NextResponse.json({ error: 'Not an ANA project' }, { status: 404 })
    }

    const updated = await Project.findByIdAndUpdate(id, { $set: set }, { new: true })
      .select('ana')
      .lean() as { ana?: Record<string, string> } | null

    return NextResponse.json({ ok: true, ana: updated?.ana ?? {} })
  } catch (err) {
    console.error('[PATCH /api/ana/projects/[id]]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
