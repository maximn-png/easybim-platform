import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveViewerHub } from '@/lib/services/apsHubs'
import { listCoordinationModels, type CoordinationModel } from '@/lib/services/apsCoordination'
import { swrCache } from '@/lib/server/pageCache'

// GET /api/projects/[id]/coordination-models
// The project's coordination models (translated, with publish/modified dates)
// for the internal project page's model viewer. Works only for hubs whose
// 2-legged credentials we hold (EasyBIM + configured partner hubs like ANA);
// anything else → { unsupported: true } and the card hides itself.
// Snapshots are stored in Mongo (stale-while-revalidate): only the first-ever
// view pays the ACC folder crawl; a transient ACC failure keeps the last good
// snapshot instead of blanking the card. ?refresh=1 forces a live crawl.

const CACHE_TTL_MS = 10 * 60_000
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ unsupported: true })

  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()

  const doc = await Project.findById(id).select('externalIds').lean() as Record<string, unknown> | null
  if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const ext = (doc.externalIds ?? {}) as Record<string, unknown>
  const accProjectId = ext.accProjectId as string | undefined
  const hub = resolveViewerHub(ext.accHubId as string | undefined, ext.accExternalHub as boolean | undefined)
  if (!hub || !accProjectId) return NextResponse.json({ unsupported: true })

  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  try {
    const { data: models, cachedAt } = await swrCache<CoordinationModel[]>(
      `coord:${id}`, CACHE_TTL_MS, refresh,
      () => listCoordinationModels(accProjectId, hub),
    )
    return NextResponse.json({
      models,
      syncedAt: (cachedAt ?? new Date()).toISOString(),
      hubKey: hub.key,
      hubName: hub.name,
    })
  } catch (err) {
    console.error('[GET /api/projects/[id]/coordination-models]', err)
    return NextResponse.json({ error: 'ACC fetch failed' }, { status: 502 })
  }
}
