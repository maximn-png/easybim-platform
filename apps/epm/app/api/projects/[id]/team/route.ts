import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchAccProjectMembers, getApsToken } from '@/lib/services/apsService'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ members: [], mock: true })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const doc = await Project.findById(id).lean() as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const ext = (doc.externalIds ?? {}) as Record<string, unknown>
    const accProjectId = ext.accProjectId as string | undefined

    if (!accProjectId) {
      return NextResponse.json({ members: [], noAccProject: true })
    }

    // Project-members lookup uses a 2-legged (client credentials) token.
    const token = await getApsToken()
    const members = await fetchAccProjectMembers(accProjectId, token)

    return NextResponse.json({ members, count: members.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/projects/[id]/team]', err)
    return NextResponse.json({ error: msg, members: [] }, { status: 500 })
  }
}
