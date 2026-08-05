import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveViewerHub } from '@/lib/services/apsHubs'
import { getApsViewerToken } from '@/lib/services/apsViewer'

// GET /api/projects/[id]/viewer-token
// Short-lived 2-legged token (data:read viewables:read) for the browser
// Autodesk Viewer, scoped to whichever hub the project resolves to
// (EasyBIM or a configured partner hub). Read-only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'No DB' }, { status: 503 })

  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()

  const doc = await Project.findById(id).select('externalIds').lean() as Record<string, unknown> | null
  if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const ext = (doc.externalIds ?? {}) as Record<string, unknown>
  const hub = resolveViewerHub(ext.accHubId as string | undefined, ext.accExternalHub as boolean | undefined)
  if (!hub) return NextResponse.json({ error: 'Hub not supported' }, { status: 503 })

  try {
    const { access_token, expires_in } = await getApsViewerToken(hub)
    return NextResponse.json({ access_token, expires_in })
  } catch (err) {
    console.error('[GET /api/projects/[id]/viewer-token]', err)
    return NextResponse.json({ error: 'Token fetch failed' }, { status: 502 })
  }
}
