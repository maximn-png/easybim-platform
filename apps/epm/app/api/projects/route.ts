import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { ProjectRow, ProjectsApiResponse } from '@/lib/types'
import type { ExternalIds } from '@/app/models/Project'
import { mockProjects } from '@/lib/mockProjects'

function isAdmin(userId: string): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return adminIds.includes(userId)
}

function toProjectRow(doc: Record<string, unknown>): ProjectRow {
  const snap = (doc.snapshot ?? {}) as Record<string, unknown>
  const ext  = (doc.externalIds ?? {}) as Record<string, unknown>

  const toMember = (m: unknown) => {
    if (!m || typeof m !== 'object') return undefined
    const member = m as Record<string, unknown>
    return {
      name: String(member.name ?? ''),
      avatarUrl: member.avatarUrl as string | undefined,
      profileUrl: member.profileUrl as string | undefined,
    }
  }

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
    accLinkSource: ext.accLinkSource as ProjectRow['accLinkSource'],
    accExternalHub: ext.accExternalHub as boolean | undefined,
    status: (snap.status as ProjectRow['status']) ?? null,
    milestoneProgress: (snap.milestoneProgress as number | null) ?? null,
    hoursProgress: (snap.hoursProgress as number | null) ?? null,
    actualHours: (snap.actualHours as number | null) ?? null,
    budgetHours: (snap.budgetHours as number | null) ?? null,
    openIssuesCount: (snap.openIssuesCount as number | null) ?? null,
    accModelStatus: (snap.accModelStatus as string | null) ?? null,
    bimManager: toMember(snap.bimManager),
    mepCoordinator: toMember(snap.mepCoordinator),
    bimModeller: toMember(snap.bimModeller),
    sync: {
      lastSyncedAt: snap.lastSyncedAt ? new Date(snap.lastSyncedAt as string).toISOString() : null,
      syncStatus: (snap.syncStatus as ProjectRow['sync']['syncStatus']) ?? 'never',
      mondayLastSyncedAt: snap.mondayLastSyncedAt ? new Date(snap.mondayLastSyncedAt as string).toISOString() : null,
      sheetsLastSyncedAt: snap.sheetsLastSyncedAt ? new Date(snap.sheetsLastSyncedAt as string).toISOString() : null,
      accLastSyncedAt: snap.accLastSyncedAt ? new Date(snap.accLastSyncedAt as string).toISOString() : null,
    },
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const statusFilter = searchParams.get('status')

  if (!process.env.MONGODB_URI) {
    let projects = mockProjects
    if (statusFilter) {
      projects = projects.filter(p => p.status === statusFilter)
    }
    const response: ProjectsApiResponse = { projects, count: projects.length, asOf: new Date().toISOString() }
    return NextResponse.json(response)
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const query: Record<string, unknown> = { isActive: true }
    if (statusFilter) query['snapshot.status'] = statusFilter

    const docs = await Project
      .find(query)
      .sort({ displayOrder: 1, projectName: 1 })
      .lean()

    const projects = (docs as unknown as Record<string, unknown>[]).map(toProjectRow)
    const response: ProjectsApiResponse = { projects, count: projects.length, asOf: new Date().toISOString() }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[GET /api/projects]', err)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId || !isAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const { projectName, projectNumber, externalIds, displayOrder } = body

    if (!projectName || !projectNumber || !externalIds) {
      return NextResponse.json({ error: 'projectName, projectNumber, and externalIds are required' }, { status: 400 })
    }

    const extIds = externalIds as Record<string, unknown>
    if (!extIds.mondayBoardId || !extIds.mondayBoardUrl || !extIds.driveFolderId || !extIds.driveFolderUrl) {
      return NextResponse.json(
        { error: 'externalIds must include mondayBoardId, mondayBoardUrl, driveFolderId, driveFolderUrl' },
        { status: 400 }
      )
    }

    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const input = {
      projectName: String(projectName),
      projectNumber: String(projectNumber),
      externalIds: externalIds as ExternalIds,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : undefined,
    }
    const project = await Project.create(input)
    const doc = (project as unknown as { toObject: () => Record<string, unknown> }).toObject()
    return NextResponse.json({ project: toProjectRow(doc) }, { status: 201 })
  } catch (err: unknown) {
    const mongoErr = err as { code?: number }
    if (mongoErr.code === 11000) {
      return NextResponse.json({ error: 'Project number already exists' }, { status: 409 })
    }
    console.error('[POST /api/projects]', err)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
