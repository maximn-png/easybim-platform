import { notFound } from 'next/navigation'
import type { ProjectRow, ReportListItem } from '@/lib/types'
import { mockProjects } from '@/lib/mockProjects'
import { deriveHoursProgress } from '@/lib/hours'
import { resolveAccUrl } from '@/lib/services/apsService'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import ProjectDetailClient from '@/components/ProjectDetailClient'

// Render on request so detail data reflects the latest sync (not a build snapshot).
export const dynamic = 'force-dynamic'

// Saved report drafts for this project (metadata only), newest first.
async function fetchReports(id: string): Promise<ReportListItem[]> {
  if (!process.env.MONGODB_URI) return []
  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()
    const docs = await Report.find({ projectId: id })
      .select('kind title subject recipients draftId gmailUrl issueCount createdByName createdAt issuesSnapshot._id')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean() as unknown as Array<Record<string, unknown>>
    return docs.map(d => ({
      _id: String(d._id),
      // Fallback for rows saved before `kind` existed: internal reports have no
      // recipients (the email flow always has ≥1), so empty ⇒ internal.
      kind: (d.kind as 'email' | 'internal') ?? (((d.recipients as string[])?.length ?? 0) > 0 ? 'email' : 'internal'),
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

async function fetchProject(id: string): Promise<{ project: ProjectRow } | null> {
  if (!process.env.MONGODB_URI) {
    const project = mockProjects.find(p => p._id === id) ?? mockProjects[0]
    return project ? { project } : null
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const toRow = (doc: Record<string, unknown>): ProjectRow => {
      const snap = (doc.snapshot ?? {}) as Record<string, unknown>
      const ext  = (doc.externalIds ?? {}) as Record<string, unknown>
      const actualHours = (snap.actualHours as number | null) ?? null
      const budgetHours = (snap.budgetHours as number | null) ?? null
      return {
        _id: String(doc._id),
        projectName: String(doc.projectName),
        projectNumber: String(doc.projectNumber),
        displayOrder: doc.displayOrder as number | undefined,
        links: {
          mondayBoard: String(ext.mondayBoardUrl ?? ''),
          dedicatedBoard: ext.dedicatedBoardUrl as string | undefined,
          mainBoard: ext.mainBoardUrl as string | undefined,
          driveFolder: String(ext.driveFolderUrl ?? ''),
          hoursSheet: ext.hoursSheetUrl as string | undefined,
          acc: resolveAccUrl(ext),
        },
        accProjectId: ext.accProjectId as string | undefined,
        accLinkSource: ext.accLinkSource as ProjectRow['accLinkSource'],
        accExternalHub: ext.accExternalHub as boolean | undefined,
        accHubName: getPartnerHubByAccountId(ext.accHubId as string | undefined)?.name,
        accHubKey: getPartnerHubByAccountId(ext.accHubId as string | undefined)?.key,
        status: (snap.status as ProjectRow['status']) ?? null,
        milestoneProgress: (snap.milestoneProgress as number | null) ?? null,
        milestoneDisciplines: (snap.milestoneDisciplines as ProjectRow['milestoneDisciplines']) ?? undefined,
        hoursProgress: deriveHoursProgress(actualHours, budgetHours),
        actualHours,
        budgetHours,
        openIssuesCount: (snap.openIssuesCount as number | null) ?? null,
        accModelStatus: (snap.accModelStatus as string | null) ?? null,
        bimManager: snap.bimManager as ProjectRow['bimManager'],
        mepCoordinator: snap.mepCoordinator as ProjectRow['mepCoordinator'],
        bimModeller: snap.bimModeller as ProjectRow['bimModeller'],
        hoursConfig: (doc.hoursConfig as ProjectRow['hoursConfig']) ?? undefined,
        sync: {
          lastSyncedAt: snap.lastSyncedAt ? new Date(snap.lastSyncedAt as string).toISOString() : null,
          syncStatus: (snap.syncStatus as ProjectRow['sync']['syncStatus']) ?? 'never',
          mondayLastSyncedAt: snap.mondayLastSyncedAt ? new Date(snap.mondayLastSyncedAt as string).toISOString() : null,
          sheetsLastSyncedAt: snap.sheetsLastSyncedAt ? new Date(snap.sheetsLastSyncedAt as string).toISOString() : null,
          accLastSyncedAt: snap.accLastSyncedAt ? new Date(snap.accLastSyncedAt as string).toISOString() : null,
        },
      }
    }

    const doc = await Project.findById(id).lean()
    if (!doc) return null

    return { project: toRow(doc as unknown as Record<string, unknown>) }
  } catch {
    return null
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [data, reports] = await Promise.all([fetchProject(id), fetchReports(id)])

  if (!data) notFound()

  return (
    <ProjectDetailClient project={data.project} reports={reports} />
  )
}
