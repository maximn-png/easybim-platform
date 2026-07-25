import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { guardSharedProjectForAna } from '@/lib/server/anaAccess'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import { listViewableModels } from '@/lib/services/apsViewer'
import { getApsUserToken } from '@/lib/services/apsUserToken'

// GET /api/ana/projects/[id]/models
// The project's translated 3D models (name + Viewer URN) for the combined-model
// card. ANA-guarded (ANA clients may read only ANA-hub projects).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const denied = await guardSharedProjectForAna('GET', id)
  if (denied) return denied

  if (!process.env.MONGODB_URI) return NextResponse.json({ models: [] })

  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()

  const doc = await Project.findById(id).select('externalIds').lean() as Record<string, unknown> | null
  if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const ext = (doc.externalIds ?? {}) as Record<string, unknown>
  const hub = getPartnerHubByAccountId(ext.accHubId as string | undefined)
  const accProjectId = ext.accProjectId as string | undefined
  if (hub?.key !== 'ana' || !accProjectId) {
    return NextResponse.json({ models: [], pdfs: [] })
  }

  // ACC Files descriptions need a 3-legged ANA token (same one Issues uses).
  // Absent it, models still load — descriptions just come back empty.
  const descToken = (await getApsUserToken(hub)) ?? undefined
  const { models, pdfs } = await listViewableModels(accProjectId, hub, descToken)
  // needsAccAuth → no 3-legged ANA token, so descriptions/issues can't be read.
  return NextResponse.json({ models, pdfs, needsAccAuth: !descToken })
}
