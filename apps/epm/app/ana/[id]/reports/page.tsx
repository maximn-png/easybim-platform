import { notFound } from 'next/navigation'
import type { ProjectRow } from '@/lib/types'
import { mockProjects } from '@/lib/mockProjects'
import BimReportClient from '@/components/BimReportClient'
import { resolveAccUrl } from '@/lib/services/apsService'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import { getAnaNumberMap } from '@/lib/server/anaAcc'

export const dynamic = 'force-dynamic'

async function fetchAnaProject(id: string, numberMap: Map<string, string>): Promise<ProjectRow | null> {
  if (!process.env.MONGODB_URI) {
    return mockProjects.find(p => p._id === id && p.accHubName === 'ANA') ?? null
  }
  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const doc = await Project.findById(id).lean() as Record<string, unknown> | null
    if (!doc) return null

    const ext = (doc.externalIds ?? {}) as Record<string, unknown>
    const hub = getPartnerHubByAccountId(ext.accHubId as string | undefined)
    if (hub?.key !== 'ana') return null   // ANA area serves ANA-hub projects only

    const snap = (doc.snapshot ?? {}) as Record<string, unknown>
    const ana  = (doc.ana ?? {}) as Record<string, string>
    const accProjectId = ext.accProjectId as string | undefined
    return {
      _id: String(doc._id),
      projectName: String(doc.projectName),
      projectNumber: String(doc.projectNumber),
      ana: {
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
      accProjectId: ext.accProjectId as string | undefined,
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
        lastSyncedAt: null,
        syncStatus: 'ok',
        mondayLastSyncedAt: null,
        sheetsLastSyncedAt: null,
        accLastSyncedAt: null,
      },
    }
  } catch {
    return null
  }
}

export default async function AnaReportsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numberMap = await getAnaNumberMap()
  const project = await fetchAnaProject(id, numberMap)
  if (!project) notFound()

  return <BimReportClient project={project} anaView />
}
