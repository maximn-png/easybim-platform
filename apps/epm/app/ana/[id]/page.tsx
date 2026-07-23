import { notFound } from 'next/navigation'
import type { ProjectRow, ReportListItem } from '@/lib/types'
import { mockProjects } from '@/lib/mockProjects'
import { resolveAccUrl } from '@/lib/services/apsService'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import AnaProjectDetailClient from '@/components/ana/AnaProjectDetailClient'

export const dynamic = 'force-dynamic'

async function fetchReports(id: string): Promise<ReportListItem[]> {
  if (!process.env.MONGODB_URI) return []
  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()
    const docs = await Report.find({ projectId: id })
      .select('title subject recipients draftId gmailUrl issueCount createdByName createdAt issuesSnapshot._id')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean() as unknown as Array<Record<string, unknown>>
    return docs.map(d => ({
      _id: String(d._id),
      title: d.title as string,
      subject: d.subject as string,
      recipients: (d.recipients as string[]) ?? [],
      draftId: d.draftId as string | undefined,
      gmailUrl: d.gmailUrl as string | undefined,
      issueCount: d.issueCount as number | undefined,
      createdByName: d.createdByName as string | undefined,
      createdAt: d.createdAt ? new Date(d.createdAt as string).toISOString() : null,
      hasSnapshot: Array.isArray(d.issuesSnapshot) && d.issuesSnapshot.length > 0,
    }))
  } catch {
    return []
  }
}

async function fetchAnaProject(id: string): Promise<ProjectRow | null> {
  if (!process.env.MONGODB_URI) {
    const p = mockProjects.find(m => m._id === id && m.accHubName === 'ANA')
    return p ?? null
  }
  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const doc = await Project.findById(id).lean() as Record<string, unknown> | null
    if (!doc) return null

    const ext  = (doc.externalIds ?? {}) as Record<string, unknown>
    const hub  = getPartnerHubByAccountId(ext.accHubId as string | undefined)
    // Only ANA-hub projects are reachable through the ANA area.
    if (hub?.key !== 'ana') return null

    const snap = (doc.snapshot ?? {}) as Record<string, unknown>
    const ana  = (doc.ana ?? {}) as Record<string, string>
    return {
      _id: String(doc._id),
      projectName: String(doc.projectName),
      projectNumber: String(doc.projectNumber),
      ana: {
        number: ana.number ?? '',
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

export default async function AnaProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [project, reports] = await Promise.all([fetchAnaProject(id), fetchReports(id)])
  if (!project) notFound()

  return <AnaProjectDetailClient project={project} reports={reports} />
}
