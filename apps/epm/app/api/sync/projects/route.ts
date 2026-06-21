import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  fetchAllAccProjects,
  matchAccProjectByNumber,
  accProjectUrl,
  parseAccProjectId,
  getApsToken,
  type AccProjectSummary,
} from '@/lib/services/apsService'

const MA004_BOARD_ID  = '7321609006'
const MA004_BOARD_URL = 'https://easybim-company.monday.com/boards/7321609006'

function isAuthorized(req: NextRequest, userId: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
    if (bearer === cronSecret) return true
    if (req.headers.get('x-cron-secret') === cronSecret) return true
  }
  return !!userId
}

// Vercel Cron hits GET
export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!isAuthorized(req, userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not set' }, { status: 503 })
  }

  const start = Date.now()
  const errors: string[] = []
  let synced = 0

  try {
    const [
      { connectDB },
      ProjectModule,
      { fetchActiveMA004Projects, fetchMA003ByItemIds, fetchUserPhotos },
    ] = await Promise.all([
      import('@easybim/db'),
      import('@/app/models/Project'),
      import('@/lib/services/mondayService'),
    ])

    const Project = ProjectModule.default
    await connectDB()

    // 1. Fetch MA-004 active projects + existing MongoDB ma003ItemIds in parallel
    const [ma004Projects, existingDocs] = await Promise.all([
      fetchActiveMA004Projects(),
      Project.find({ isActive: true }).select('projectNumber externalIds').lean() as Promise<Array<{ projectNumber: string; externalIds?: { ma003ItemId?: string; accProjectId?: string; accLinkSource?: 'auto' | 'manual' | 'ma003' } }>>
    ])

    // Map projectNumber → stored ma003ItemId as fallback when board_relation is empty
    const storedMa003Map = new Map(
      existingDocs.map(d => [d.projectNumber, d.externalIds?.ma003ItemId]).filter(([, v]) => v) as [string, string][]
    )

    // projectNumber → existing externalIds (for accLinkSource stickiness + existing accProjectId)
    const existingExtMap = new Map(
      existingDocs.map(d => [d.projectNumber, d.externalIds ?? {}])
    )

    // 1b. Fetch all ACC projects once (best-effort — ACC link is optional).
    // The connection is detected by matching projectNumber → ACC jobNumber,
    // independent of Monday (MA-003 is being retired).
    let accProjects: AccProjectSummary[] = []
    try {
      accProjects = await fetchAllAccProjects(await getApsToken())
    } catch (err) {
      errors.push(`ACC projects: ${err instanceof Error ? err.message : String(err)}`)
    }
    // Only trust ACC-based decisions when the account list actually loaded — a
    // failed fetch (e.g. wrong/unprovisioned account) yields an empty list, and
    // we must NOT then mis-mark every project as external or wipe links.
    const accListOk = accProjects.length > 0
    const easybimIdSet = new Set(accProjects.map(p => p.id))
    const isExternalHub = (id?: string) => !!id && !easybimIdSet.has(id)

    // 2. Collect all MA-003 item IDs — live from board_relation + stored fallbacks
    const allMa003Ids = [...new Set([
      ...ma004Projects.flatMap(p => p.ma003ItemIds),
      ...storedMa003Map.values(),
    ])]

    // 3. Fetch MA-003 team + ACC data
    const ma003Map = await fetchMA003ByItemIds(allMa003Ids)

    // 4. Fetch user profile photos + real names from Monday users API
    const allMondayIds = [...new Set(
      [...ma003Map.values()].flatMap(m => [
        m.bimManager?.mondayId,
        m.mepCoordinator?.mondayId,
        m.bimModeller?.mondayId,
      ].filter(Boolean) as string[])
    )]
    const photoMap = await fetchUserPhotos(allMondayIds)

    // 5. Upsert each project
    // NOTE: actualHours / hoursProgress are intentionally NOT updated here —
    // they are managed by updateHours.ts and preserved across syncs.
    for (const p of ma004Projects) {
      try {
        if (!p.projectNumber) continue

        // Use live board_relation first, fall back to stored value if empty
        const ma003Id   = p.ma003ItemIds[0] ?? storedMa003Map.get(p.projectNumber) ?? null
        const ma003     = ma003Id ? ma003Map.get(ma003Id) : undefined

        // ACC link resolution. Only act when the ACC account list loaded — see
        // accListOk note above. Priority:
        //   1. manual (sticky) — never overwritten; only refresh the external flag
        //   2. auto-match by projectNumber → ACC jobNumber (EasyBIM hub)
        //   3. fall back to the Monday MA-003 ACC link (often a client/external hub)
        //   4. otherwise preserve any existing link, refreshing its external flag
        const accFields: Record<string, unknown> = {}
        const existingExt = existingExtMap.get(p.projectNumber) ?? {}
        if (accListOk) {
          if (existingExt.accLinkSource === 'manual') {
            if (existingExt.accProjectId) {
              accFields['externalIds.accExternalHub'] = isExternalHub(existingExt.accProjectId)
            }
          } else {
            const match = matchAccProjectByNumber(accProjects, p.projectNumber)
            const ma003Gid = ma003?.accUrl ? parseAccProjectId(ma003.accUrl) : null
            if (match) {
              accFields['externalIds.accProjectId']   = match.id
              accFields['externalIds.accProjectUrl']  = accProjectUrl(match.id)
              accFields['externalIds.accLinkSource']  = 'auto'
              accFields['externalIds.accExternalHub'] = false
              accFields['snapshot.accLastSyncedAt']   = new Date()
            } else if (ma003Gid) {
              // Keep the original MA-003 URL so the link opens the real (possibly
              // EMEA/client) project, not a synthesized acc.autodesk.com/projects URL.
              accFields['externalIds.accProjectId']   = ma003Gid
              accFields['externalIds.accProjectUrl']  = ma003!.accUrl
              accFields['externalIds.accLinkSource']  = 'ma003'
              accFields['externalIds.accExternalHub'] = isExternalHub(ma003Gid)
              accFields['snapshot.accLastSyncedAt']   = new Date()
            } else if (existingExt.accProjectId) {
              accFields['externalIds.accExternalHub'] = isExternalHub(existingExt.accProjectId)
            }
          }
        }

        const toMember = (m?: { name: string; mondayId: string }) => {
          if (!m) return undefined
          const userData = photoMap.get(m.mondayId)
          return {
            name:      userData?.name ?? m.name,
            mondayId:  m.mondayId,
            avatarUrl: userData?.avatarUrl,
          }
        }

        await Project.findOneAndUpdate(
          { projectNumber: p.projectNumber },
          {
            $set: {
              projectName: p.projectName,
              isActive:    true,
              // Monday-owned fields via dot-notation so we never clobber the
              // ACC link (managed by auto-detect / manual override below).
              'externalIds.mondayBoardId':  MA004_BOARD_ID,
              'externalIds.mondayBoardUrl': MA004_BOARD_URL,
              'externalIds.mondayItemId':   p.itemId,
              'externalIds.ma003ItemId':    ma003Id ?? undefined,
              'externalIds.mainBoardUrl':   ma003?.mainBoardUrl ?? undefined,
              ...accFields,
              'snapshot.status':             p.status,
              // Total budget = שכט סופי ÷ 300 (formula8). Only overwrite when the
              // formula resolved, so a transient empty read can't wipe a good value.
              ...(p.budgetHours != null ? { 'snapshot.budgetHours': p.budgetHours } : {}),
              'snapshot.bimManager':         toMember(ma003?.bimManager),
              'snapshot.mepCoordinator':     toMember(ma003?.mepCoordinator),
              'snapshot.bimModeller':        toMember(ma003?.bimModeller),
              'snapshot.lastSyncedAt':       new Date(),
              'snapshot.mondayLastSyncedAt': new Date(),
              'snapshot.syncStatus':         'ok',
              'snapshot.syncError':          undefined,
            },
          },
          { upsert: true, new: true, runValidators: false }
        )
        synced++
      } catch (err) {
        errors.push(`Project ${p.projectNumber}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({ synced, errors, durationMs: Date.now() - start })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), synced, errors },
      { status: 500 }
    )
  }
}
