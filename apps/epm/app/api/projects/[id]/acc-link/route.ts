import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { accProjectUrl } from '@/lib/services/apsService'

// Manually links an EPM project to an ACC project chosen from the dropdown.
// Marked accLinkSource:'manual' so the auto-detect sync never overwrites it.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null) as { accProjectId?: string } | null
  const accProjectId = body?.accProjectId?.trim()
  if (!accProjectId) {
    return NextResponse.json({ error: 'accProjectId is required' }, { status: 400 })
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ ok: true, mock: true, accProjectId })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const accUrl = accProjectUrl(accProjectId)
    const doc = await Project.findByIdAndUpdate(
      id,
      {
        $set: {
          'externalIds.accProjectId':  accProjectId,
          'externalIds.accProjectUrl': accUrl,
          'externalIds.accLinkSource': 'manual',
          'snapshot.accLastSyncedAt':  new Date(),
        },
      },
      { new: true }
    ).lean() as Record<string, unknown> | null

    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    return NextResponse.json({ ok: true, accProjectId, accProjectUrl: accUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/projects/[id]/acc-link]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
