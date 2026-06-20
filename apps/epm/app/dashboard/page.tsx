import { mockProjects } from '@/lib/mockProjects'
import type { ProjectsApiResponse } from '@/lib/types'
import { deriveHoursProgress } from '@/lib/hours'
import DashboardClient from '@/components/DashboardClient'

async function fetchProjects(): Promise<ProjectsApiResponse> {
  if (!process.env.MONGODB_URI) {
    return { projects: mockProjects, count: mockProjects.length, asOf: new Date().toISOString(), lastSyncedAt: null }
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const docs = await Project
      .find({ isActive: true })
      .sort({ displayOrder: 1, projectName: 1 })
      .lean()

    const projects = (docs as unknown as Record<string, unknown>[]).map(doc => {
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
          mainBoard: ext.mainBoardUrl as string | undefined,
          driveFolder: String(ext.driveFolderUrl ?? ''),
          hoursSheet: ext.hoursSheetUrl as string | undefined,
          acc: ext.accProjectUrl as string | undefined,
        },
        accProjectId: ext.accProjectId as string | undefined,
        accLinkSource: ext.accLinkSource as import('@/lib/types').AccLinkSource | undefined,
        accExternalHub: ext.accExternalHub as boolean | undefined,
        status: (snap.status as import('@/lib/types').ProjectRow['status']) ?? null,
        milestoneProgress: (snap.milestoneProgress as number | null) ?? null,
        hoursProgress: deriveHoursProgress(actualHours, budgetHours),
        actualHours,
        budgetHours,
        openIssuesCount: (snap.openIssuesCount as number | null) ?? null,
        accModelStatus: (snap.accModelStatus as string | null) ?? null,
        bimManager: snap.bimManager as import('@/lib/types').TeamMemberPayload | undefined,
        mepCoordinator: snap.mepCoordinator as import('@/lib/types').TeamMemberPayload | undefined,
        bimModeller: snap.bimModeller as import('@/lib/types').TeamMemberPayload | undefined,
        sync: {
          lastSyncedAt: snap.lastSyncedAt ? new Date(snap.lastSyncedAt as string).toISOString() : null,
          syncStatus: (snap.syncStatus as import('@/lib/types').ProjectSyncMeta['syncStatus']) ?? 'never',
          mondayLastSyncedAt: snap.mondayLastSyncedAt ? new Date(snap.mondayLastSyncedAt as string).toISOString() : null,
          sheetsLastSyncedAt: snap.sheetsLastSyncedAt ? new Date(snap.sheetsLastSyncedAt as string).toISOString() : null,
          accLastSyncedAt: snap.accLastSyncedAt ? new Date(snap.accLastSyncedAt as string).toISOString() : null,
        },
      }
    })

    // Find the most recent lastSyncedAt across all projects
    const lastSyncedAt = projects.reduce<string | null>((latest, p) => {
      if (!p.sync.lastSyncedAt) return latest
      if (!latest) return p.sync.lastSyncedAt
      return p.sync.lastSyncedAt > latest ? p.sync.lastSyncedAt : latest
    }, null)

    return { projects, count: projects.length, asOf: new Date().toISOString(), lastSyncedAt }
  } catch (err) {
    console.error('[dashboard] DB fetch failed, falling back to mock data:', err)
    return { projects: mockProjects, count: mockProjects.length, asOf: new Date().toISOString(), lastSyncedAt: null }
  }
}

export default async function DashboardPage() {
  const { projects, lastSyncedAt } = await fetchProjects()

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1e248c]">Projects</h1>
          <p className="text-gray-500 text-sm mt-1">
            {projects.filter(p => p.status !== 'Done').length} active ·{' '}
            {projects.length} total projects
          </p>
        </div>

        {/* Main content */}
        <DashboardClient projects={projects} lastSyncedAt={lastSyncedAt} />
      </div>
    </div>
  )
}
