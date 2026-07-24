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
import { getPartnerHubs, type ApsHub } from '@/lib/services/apsHubs'

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
      { fetchActiveMA004Projects, fetchMA003ByItemIds, fetchUserPhotos, fetchDedicatedBoardUrls, fetchMilestoneStatsByProject, fetchAllTimesheetHours },
      { driveEnabled, findProjectFolders },
    ] = await Promise.all([
      import('@easybim/db'),
      import('@/app/models/Project'),
      import('@/lib/services/mondayService'),
      import('@/lib/services/driveService'),
    ])

    const Project = ProjectModule.default
    await connectDB()

    // 1. Fetch MA-004 projects + existing MongoDB ma003ItemIds in parallel
    const [allMa004Projects, existingDocs] = await Promise.all([
      fetchActiveMA004Projects(),
      Project.find({ isActive: true }).select('projectNumber externalIds').lean() as Promise<Array<{ projectNumber: string; externalIds?: { ma003ItemId?: string; accProjectId?: string; accLinkSource?: 'auto' | 'manual' | 'ma003' } }>>
    ])

    // Active projects always sync. Done projects also get the full per-project
    // lookups (Drive, milestones, MA-003 team, ACC) — but ONLY when they already
    // exist in EPM, so long-finished projects that were never in EPM are still not
    // created. A Done project's upsert therefore runs update-only (see loop below).
    const existingNumbers = new Set(existingDocs.map(d => d.projectNumber))
    const ma004Projects = allMa004Projects.filter(
      p => !!p.projectNumber && (p.status !== 'Done' || existingNumbers.has(p.projectNumber))
    )

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

    // 1b². Partner hubs (client ACC accounts that provisioned our integration,
    // e.g. ANA): map each hub's project GUIDs so their projects get stamped with
    // the owning hub and served live instead of via Excel import. Best-effort.
    const partnerHubByProjectId = new Map<string, ApsHub>()
    const partnerHubLists: Array<{ hub: ApsHub; list: AccProjectSummary[] }> = []
    for (const hub of getPartnerHubs()) {
      try {
        const list = await fetchAllAccProjects(await getApsToken(hub), hub.accountId)
        list.forEach(p => partnerHubByProjectId.set(p.id, hub))
        partnerHubLists.push({ hub, list })
      } catch (err) {
        errors.push(`ACC ${hub.name} hub: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    // Hub-membership fields for an ACC link: identifies the partner hub that owns
    // the project (null clears a stale stamp when the link changed hubs). When any
    // configured hub failed to load, leave existing stamps untouched — a transient
    // API failure must not demote its projects back to the Excel-import path.
    const partnerListsOk = getPartnerHubs().length === partnerHubLists.length
    const hubFields = (accProjectGid?: string | null): Record<string, unknown> => {
      if (!partnerListsOk) return {}
      const hub = accProjectGid ? partnerHubByProjectId.get(accProjectGid) : undefined
      return {
        'externalIds.accHubId':   hub?.accountId ?? null,
        'externalIds.accHubName': hub?.name ?? null,
      }
    }

    const projectNumbers = ma004Projects.map(p => p.projectNumber).filter(Boolean)

    // 1c. Resolve each project's dedicated Monday board (matched by project
    // number across all boards) — best-effort; failure must not abort the sync.
    const dedicatedBoardUrls = new Map<string, string>()
    try {
      const { urls, ambiguous } = await fetchDedicatedBoardUrls(projectNumbers)
      urls.forEach((url, num) => dedicatedBoardUrls.set(num, url))
      if (ambiguous.length > 0) {
        errors.push(`Dedicated board ambiguous matches: ${ambiguous.join(', ')}`)
      }
    } catch (err) {
      errors.push(`Dedicated boards: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 1d. Resolve each project's Google Drive folder (matched by project number
    // inside the parent folder) — best-effort; only runs when Drive is configured.
    const driveFolders = new Map<string, { id: string; url: string }>()
    if (driveEnabled()) {
      try {
        const { folders, ambiguous } = await findProjectFolders(projectNumbers)
        folders.forEach((folder, num) => driveFolders.set(num, folder))
        if (ambiguous.length > 0) {
          errors.push(`Drive folder ambiguous matches: ${ambiguous.join(', ')}`)
        }
      } catch (err) {
        errors.push(`Drive folders: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 1e. Milestone completion stats from MI-001-MilestonesProjects, keyed by the
    // project's MA-004 item id — best-effort; failure must not abort the sync.
    let milestoneStats = new Map<string, import('@/lib/services/mondayService').MilestoneStats>()
    try {
      milestoneStats = await fetchMilestoneStatsByProject()
    } catch (err) {
      errors.push(`Milestones: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 1f. Actual hours per project from TS-001/003/004/005, keyed by MA-003 item
    // id — one bulk pass across all timesheet boards; best-effort. This is the
    // same live figure the project page's Hours Analytics card computes, so the
    // dashboard hours column now matches it (replaces the manual updateHours.ts).
    let timesheetHours = new Map<string, import('@/lib/services/mondayService').TS001HoursSummary>()
    try {
      timesheetHours = await fetchAllTimesheetHours()
    } catch (err) {
      errors.push(`Timesheet hours: ${err instanceof Error ? err.message : String(err)}`)
    }

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
    for (const p of ma004Projects) {
      try {
        if (!p.projectNumber) continue

        // Use live board_relation first, fall back to stored value if empty
        const ma003Id   = p.ma003ItemIds[0] ?? storedMa003Map.get(p.projectNumber) ?? null
        const ma003     = ma003Id ? ma003Map.get(ma003Id) : undefined

        // Milestone completion (joined by MA-004 item id). Absent → leave null/[].
        const milestones = milestoneStats.get(p.itemId)

        // Actual hours (joined by MA-003 item id) + derived progress vs budget.
        // Only overwrite when a value resolved, so a transient empty read can't
        // wipe good stored hours. Progress mirrors deriveHoursProgress().
        const actualHours   = ma003Id ? timesheetHours.get(ma003Id)?.actualHours ?? null : null
        const hoursProgress =
          actualHours != null && p.budgetHours && p.budgetHours > 0
            ? Math.min(999, Math.max(0, Math.round((actualHours / p.budgetHours) * 100)))
            : null

        // ACC link resolution. Only act when the ACC account list loaded — see
        // accListOk note above. Priority:
        //   1. manual (sticky) — never overwritten; only refresh the hub flags
        //   2. auto-match by projectNumber → ACC jobNumber (EasyBIM hub)
        //   3. auto-match by projectNumber in a partner hub (e.g. ANA)
        //   4. fall back to the Monday MA-003 ACC link (often a client/external hub)
        //   5. otherwise preserve any existing link, refreshing its hub flags
        const accFields: Record<string, unknown> = {}
        const existingExt = existingExtMap.get(p.projectNumber) ?? {}
        if (accListOk) {
          if (existingExt.accLinkSource === 'manual') {
            if (existingExt.accProjectId) {
              accFields['externalIds.accExternalHub'] = isExternalHub(existingExt.accProjectId)
              Object.assign(accFields, hubFields(existingExt.accProjectId))
            }
          } else {
            const match = matchAccProjectByNumber(accProjects, p.projectNumber)
            const partnerMatch = partnerHubLists
              .map(({ hub, list }) => ({ hub, project: matchAccProjectByNumber(list, p.projectNumber) }))
              .find(m => m.project)
            const ma003Gid = ma003?.accUrl ? parseAccProjectId(ma003.accUrl) : null
            if (match) {
              accFields['externalIds.accProjectId']   = match.id
              accFields['externalIds.accProjectUrl']  = accProjectUrl(match.id)
              accFields['externalIds.accLinkSource']  = 'auto'
              accFields['externalIds.accExternalHub'] = false
              Object.assign(accFields, hubFields(null))
              accFields['snapshot.accLastSyncedAt']   = new Date()
            } else if (partnerMatch?.project) {
              accFields['externalIds.accProjectId']   = partnerMatch.project.id
              accFields['externalIds.accProjectUrl']  = accProjectUrl(partnerMatch.project.id)
              accFields['externalIds.accLinkSource']  = 'auto'
              accFields['externalIds.accExternalHub'] = true
              Object.assign(accFields, hubFields(partnerMatch.project.id))
              accFields['snapshot.accLastSyncedAt']   = new Date()
            } else if (ma003Gid) {
              // Keep the original MA-003 URL so the link opens the real (possibly
              // EMEA/client) project, not a synthesized acc.autodesk.com/projects URL.
              accFields['externalIds.accProjectId']   = ma003Gid
              accFields['externalIds.accProjectUrl']  = ma003!.accUrl
              accFields['externalIds.accLinkSource']  = 'ma003'
              accFields['externalIds.accExternalHub'] = isExternalHub(ma003Gid)
              Object.assign(accFields, hubFields(ma003Gid))
              accFields['snapshot.accLastSyncedAt']   = new Date()
            } else if (existingExt.accProjectId) {
              accFields['externalIds.accExternalHub'] = isExternalHub(existingExt.accProjectId)
              Object.assign(accFields, hubFields(existingExt.accProjectId))
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
              'externalIds.dedicatedBoardUrl': dedicatedBoardUrls.get(p.projectNumber) ?? undefined,
              ...(driveFolders.has(p.projectNumber) ? {
                'externalIds.driveFolderId':  driveFolders.get(p.projectNumber)!.id,
                'externalIds.driveFolderUrl': driveFolders.get(p.projectNumber)!.url,
                'snapshot.sheetsLastSyncedAt': new Date(),
              } : {}),
              ...accFields,
              'snapshot.status':             p.status,
              'snapshot.milestoneProgress':  milestones?.overallProgress ?? null,
              'snapshot.milestoneDisciplines': milestones?.disciplines ?? [],
              // Total budget = שכט סופי ÷ 300 (formula8). Only overwrite when the
              // formula resolved, so a transient empty read can't wipe a good value.
              ...(p.budgetHours != null ? { 'snapshot.budgetHours': p.budgetHours } : {}),
              // Live actual hours from the timesheet boards. Only written when a
              // value resolved (see actualHours above) so an empty read never
              // clobbers good data; progress recomputed alongside it.
              ...(actualHours != null ? {
                'snapshot.actualHours':   Math.round(actualHours * 100) / 100,
                'snapshot.hoursProgress': hoursProgress,
              } : {}),
              'snapshot.bimManager':         toMember(ma003?.bimManager),
              'snapshot.mepCoordinator':     toMember(ma003?.mepCoordinator),
              'snapshot.bimModeller':        toMember(ma003?.bimModeller),
              'snapshot.lastSyncedAt':       new Date(),
              'snapshot.mondayLastSyncedAt': new Date(),
              'snapshot.syncStatus':         'ok',
              'snapshot.syncError':          undefined,
            },
          },
          // Active projects may be created; Done projects are update-only so we
          // never create a long-finished project that was never in EPM.
          { upsert: p.status !== 'Done', new: true, runValidators: false }
        )
        synced++
      } catch (err) {
        errors.push(`Project ${p.projectNumber}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Done projects now flow through the main upsert loop above (update-only),
    // so their status + full snapshot is refreshed there — no separate pass needed.

    return NextResponse.json({ synced, errors, durationMs: Date.now() - start })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), synced, errors },
      { status: 500 }
    )
  }
}
