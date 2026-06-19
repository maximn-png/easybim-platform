import { notFound } from 'next/navigation'
import type { ProjectRow } from '@/lib/types'
import { mockProjects } from '@/lib/mockProjects'
import ProjectDetailClient from '@/components/ProjectDetailClient'

async function fetchProject(id: string): Promise<{ project: ProjectRow; allProjects: ProjectRow[] } | null> {
  if (!process.env.MONGODB_URI) {
    const project = mockProjects.find(p => p._id === id) ?? mockProjects[0]
    return project ? { project, allProjects: mockProjects } : null
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const toRow = (doc: Record<string, unknown>): ProjectRow => {
      const snap = (doc.snapshot ?? {}) as Record<string, unknown>
      const ext  = (doc.externalIds ?? {}) as Record<string, unknown>
      return {
        _id: String(doc._id),
        projectName: String(doc.projectName),
        projectNumber: String(doc.projectNumber),
        displayOrder: doc.displayOrder as number | undefined,
        links: {
          mondayBoard: String(ext.mondayBoardUrl ?? ''),
          driveFolder: String(ext.driveFolderUrl ?? ''),
          hoursSheet: ext.hoursSheetUrl as string | undefined,
          acc: ext.accProjectUrl as string | undefined,
        },
        accProjectId: ext.accProjectId as string | undefined,
        accLinkSource: ext.accLinkSource as ProjectRow['accLinkSource'],
        status: (snap.status as ProjectRow['status']) ?? null,
        milestoneProgress: (snap.milestoneProgress as number | null) ?? null,
        hoursProgress: (snap.hoursProgress as number | null) ?? null,
        actualHours: (snap.actualHours as number | null) ?? null,
        budgetHours: (snap.budgetHours as number | null) ?? null,
        openIssuesCount: (snap.openIssuesCount as number | null) ?? null,
        accModelStatus: (snap.accModelStatus as string | null) ?? null,
        bimManager: snap.bimManager as ProjectRow['bimManager'],
        mepCoordinator: snap.mepCoordinator as ProjectRow['mepCoordinator'],
        bimModeller: snap.bimModeller as ProjectRow['bimModeller'],
        sync: {
          lastSyncedAt: snap.lastSyncedAt ? new Date(snap.lastSyncedAt as string).toISOString() : null,
          syncStatus: (snap.syncStatus as ProjectRow['sync']['syncStatus']) ?? 'never',
          mondayLastSyncedAt: snap.mondayLastSyncedAt ? new Date(snap.mondayLastSyncedAt as string).toISOString() : null,
          sheetsLastSyncedAt: snap.sheetsLastSyncedAt ? new Date(snap.sheetsLastSyncedAt as string).toISOString() : null,
          accLastSyncedAt: snap.accLastSyncedAt ? new Date(snap.accLastSyncedAt as string).toISOString() : null,
        },
      }
    }

    const [doc, allDocs] = await Promise.all([
      Project.findById(id).lean(),
      Project.find({ isActive: true }).sort({ displayOrder: 1, projectName: 1 }).lean(),
    ])

    if (!doc) return null

    return {
      project: toRow(doc as unknown as Record<string, unknown>),
      allProjects: (allDocs as unknown as Record<string, unknown>[]).map(toRow),
    }
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
  const data = await fetchProject(id)

  if (!data) notFound()

  return (
    <ProjectDetailClient project={data.project} allProjects={data.allProjects} />
  )
}
