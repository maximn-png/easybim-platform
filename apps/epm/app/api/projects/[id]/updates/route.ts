import { NextRequest, NextResponse } from 'next/server'
import {
  fetchItemUpdates, fetchBoardUpdates, fetchMilestoneUpdatesForProject,
  fetchBoardDocUpdates, boardIdFromUrl, type MondayUpdate,
} from '@/lib/services/mondayService'
import { swrCache } from '@/lib/server/pageCache'

// Combined, read-only Monday "updates" feed for a project, aggregated live from
// four sources (dedicated project board, its Monday docs, MI-001 milestones,
// MA-004 master item). See lib/services/mondayService.ts for the fetchers.
// Snapshots are stored in Mongo (stale-while-revalidate, see pageCache.ts):
// only a project's first-ever view pays the ~10-30s Monday sweep; later views
// answer instantly and refresh in the background. ?refresh=1 forces a live
// fetch. Falls back to a small mock when MongoDB or the Monday token is absent.

const MAX_UPDATES = 100
const CACHE_TTL_MS = 5 * 60_000

const MOCK_UPDATES: MondayUpdate[] = [
  {
    id: 'mock-1',
    body: '',
    textBody: 'the sheets still do not look good. Please fix that in every level.',
    createdAt: '2026-07-28T09:00:00Z',
    creator: { id: '1', name: 'Ethan Berry', photo: null },
    replies: [
      { id: 'mock-1-r1', body: '', textBody: 'On it — will re-export tonight.', createdAt: '2026-07-28T11:00:00Z', creator: { id: '2', name: 'Lilina Priyadarshini', photo: null } },
    ],
    assets: [],
    source: { kind: 'project-board', label: 'Project board', itemName: '04.1-Sheets', itemUrl: null },
  },
  {
    id: 'mock-2',
    body: '',
    textBody: 'אפשר להגיש בסוף החודש',
    createdAt: '2026-07-20T08:00:00Z',
    creator: { id: '3', name: 'Miri Label', photo: null },
    replies: [],
    assets: [],
    source: { kind: 'milestone', label: 'Milestones (MI-001)', itemName: 'תיאום מערכות › חשבון 3', itemUrl: null },
  },
]

interface UpdatesPayload {
  updates: MondayUpdate[]
  partialErrors?: string[]
}

// The live aggregation — each source independent, one failure must not block
// the rest. Runs on first view, on ?refresh=1, and in background revalidation.
async function aggregateUpdates(
  dedicatedBoardId: string | null,
  masterItemId: string | undefined,
): Promise<UpdatesPayload> {
  const results = await Promise.allSettled([
    dedicatedBoardId
      ? fetchBoardUpdates(dedicatedBoardId, { kind: 'project-board', label: 'Project board' })
      : Promise.resolve([] as MondayUpdate[]),
    masterItemId
      ? fetchMilestoneUpdatesForProject(masterItemId)
      : Promise.resolve([] as MondayUpdate[]),
    masterItemId
      ? fetchItemUpdates(masterItemId, { kind: 'master', label: 'Master (MA-004)' })
      : Promise.resolve([] as MondayUpdate[]),
    dedicatedBoardId
      ? fetchBoardDocUpdates(dedicatedBoardId)
      : Promise.resolve([] as MondayUpdate[]),
  ])

  const errors: string[] = []
  const merged: MondayUpdate[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
  }

  // De-dupe by update id, sort newest first, cap the total.
  const byId = new Map<string, MondayUpdate>()
  for (const u of merged) if (!byId.has(u.id)) byId.set(u.id, u)
  const updates = Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_UPDATES)

  return { updates, ...(errors.length ? { partialErrors: errors } : {}) }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!process.env.MONGODB_URI || !process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ updates: MOCK_UPDATES, mock: true })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const doc = await Project.findById(id).lean() as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const ext = (doc.externalIds ?? {}) as Record<string, unknown>
    const masterItemId      = ext.mondayItemId as string | undefined
    const dedicatedBoardUrl = ext.dedicatedBoardUrl as string | undefined
    const dedicatedBoardId  = boardIdFromUrl(dedicatedBoardUrl)

    const refresh = req.nextUrl.searchParams.get('refresh') === '1'
    const { data, cachedAt } = await swrCache<UpdatesPayload>(
      `updates:${id}`, CACHE_TTL_MS, refresh,
      () => aggregateUpdates(dedicatedBoardId, masterItemId),
    )

    return NextResponse.json({ ...data, ...(cachedAt ? { cachedAt } : {}) })
  } catch (err) {
    console.error('[GET /api/projects/[id]/updates]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
