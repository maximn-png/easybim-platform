import { NextRequest, NextResponse } from 'next/server'
import type { AgendaMilestone } from '@/lib/meTypes'

// All MI-001 milestone bills of ONE project, everyone's, all dates — feeds the
// Milestone Status hover on the project page (the same panel My Space shows).
// Uses the same Monday fetchers as /api/me/agenda; snapshots are stored in
// Mongo (stale-while-revalidate, see pageCache.ts) so only the first-ever view
// pays the live Monday read. ?refresh=1 forces a live fetch.

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!process.env.MONGODB_URI || !process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ milestones: [], mock: true })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    const { fetchMyMilestones, fetchUserPhotos } = await import('@/lib/services/mondayService')
    const { swrCache } = await import('@/lib/server/pageCache')

    await connectDB()

    const doc = await Project.findById(id).lean() as {
      projectNumber?: string
      projectName?: string
      externalIds?: { mondayItemId?: string }
    } | null
    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const ma004 = doc.externalIds?.mondayItemId
    if (!ma004) return NextResponse.json({ milestones: [] })

    const number = doc.projectNumber ?? ''
    const name = doc.projectName ?? ''

    const build = async (): Promise<AgendaMilestone[]> => {
      const bills = await fetchMyMilestones([String(ma004)])
      const employeeIds = [...new Set(bills.flatMap((b) => b.employeeIds))]
      const photos = await fetchUserPhotos(employeeIds).catch(() => new Map<string, { name: string; avatarUrl?: string }>())
      return bills.map((b) => ({
        milestoneName: b.milestoneName,
        billId: b.billId,
        billName: b.billName,
        employees: b.employeeIds.map((eid) => ({
          id: eid,
          name: photos.get(eid)?.name ?? '',
          avatarUrl: photos.get(eid)?.avatarUrl,
        })),
        projectItemId: b.projectItemId,
        project: `${number ? `${number} ` : ''}${name}`.trim(),
        projectNumber: number,
        projectName: name,
        team: b.team,
        date: b.date,
        status: b.status,
        url: b.url,
      }))
    }

    const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1'
    const { data } = await swrCache(`project-milestones:v1:${id}`, 5 * 60_000, forceRefresh, build)
    return NextResponse.json({ milestones: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/projects/[id]/milestones]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
