import type { ProjectRow } from '@/lib/types'
import { mockProjects } from '@/lib/mockProjects'
import { resolveAccUrl } from '@/lib/services/apsService'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import { getAnaNumberMap } from '@/lib/server/anaAcc'
import AnaProjectsClient from '@/components/ana/AnaProjectsClient'

// Render on request so the list reflects the latest sync + client edits.
export const dynamic = 'force-dynamic'

// Only projects that belong to the ANA partner hub are surfaced here.
async function fetchAnaProjects(): Promise<ProjectRow[]> {
  if (!process.env.MONGODB_URI) {
    return mockProjects.filter(p => p.accHubName === 'ANA')
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const [docs, numberMap] = await Promise.all([
      Project
        .find({ isActive: true })
        .sort({ displayOrder: 1, projectName: 1 })
        .lean() as unknown as Promise<Record<string, unknown>[]>,
      getAnaNumberMap(),
    ])

    const rows: ProjectRow[] = []
    for (const doc of docs) {
      const ext  = (doc.externalIds ?? {}) as Record<string, unknown>
      const hub  = getPartnerHubByAccountId(ext.accHubId as string | undefined)
      if (hub?.key !== 'ana') continue

      const snap = (doc.snapshot ?? {}) as Record<string, unknown>
      const ana  = (doc.ana ?? {}) as Record<string, string>
      const accProjectId = ext.accProjectId as string | undefined
      rows.push({
        _id: String(doc._id),
        projectName: String(doc.projectName),
        projectNumber: String(doc.projectNumber),
        ana: {
          // Number is the ACC jobNumber, resolved live from the ANA hub.
          number: (accProjectId && numberMap.get(accProjectId)) || '',
          status: ana.status ?? '',
          projectType: ana.projectType ?? '',
        },
        links: {
          mondayBoard: String(ext.mondayBoardUrl ?? ''),
          dedicatedBoard: ext.dedicatedBoardUrl as string | undefined,
          mainBoard: ext.mainBoardUrl as string | undefined,
          driveFolder: String(ext.driveFolderUrl ?? ''),
          acc: resolveAccUrl(ext),
        },
        accProjectId,
        accExternalHub: ext.accExternalHub as boolean | undefined,
        accHubName: hub.name,
        accHubKey: hub.key,
        status: (snap.status as ProjectRow['status']) ?? null,
        milestoneProgress: null,
        hoursProgress: null,
        actualHours: null,
        budgetHours: null,
        openIssuesCount: (snap.openIssuesCount as number | null) ?? null,
        accModelStatus: null,
        bimManager: snap.bimManager as ProjectRow['bimManager'],
        mepCoordinator: snap.mepCoordinator as ProjectRow['mepCoordinator'],
        sync: {
          lastSyncedAt: snap.lastSyncedAt ? new Date(snap.lastSyncedAt as string).toISOString() : null,
          syncStatus: (snap.syncStatus as ProjectRow['sync']['syncStatus']) ?? 'never',
          mondayLastSyncedAt: null,
          sheetsLastSyncedAt: null,
          accLastSyncedAt: null,
        },
      })
    }
    return rows
  } catch (err) {
    console.error('[ana] project fetch failed:', err)
    return []
  }
}

export default async function AnaProjectsPage() {
  const projects = await fetchAnaProjects()

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f6fb 0%, #e7f1fe 100%)' }}
    >
      <div className="px-6 lg:px-10 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1e248c]">ANA Projects</h1>
          <p className="text-gray-500 text-sm mt-1">{projects.length} projects</p>
        </div>
        <AnaProjectsClient projects={projects} />
      </div>
    </div>
  )
}
