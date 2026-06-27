import { notFound } from 'next/navigation'
import type { ProjectRow } from '@/lib/types'
import { mockProjects } from '@/lib/mockProjects'
import BimReportClient from '@/components/BimReportClient'

// Render on request so report data reflects the latest sync (not a build snapshot).
export const dynamic = 'force-dynamic'

async function fetchProject(id: string): Promise<ProjectRow | null> {
  if (!process.env.MONGODB_URI) {
    return mockProjects.find(p => p._id === id) ?? mockProjects[0] ?? null
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const doc = await Project.findById(id).lean() as Record<string, unknown> | null
    if (!doc) return null

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
      accExternalHub: ext.accExternalHub as boolean | undefined,
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
  } catch {
    return null
  }
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await fetchProject(id)

  if (!project) notFound()

  return <BimReportClient project={project} />
}
