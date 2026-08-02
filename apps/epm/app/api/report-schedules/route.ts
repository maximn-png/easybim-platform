import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { serializeSchedule } from '@/lib/server/scheduleDto'

export const runtime = 'nodejs'

// Every schedule, across every project — powers /dashboard/schedules.
// Project name/number are joined in so the table doesn't need N lookups.
export async function GET(_req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.MONGODB_URI) return NextResponse.json({ schedules: [] })

  try {
    const { connectDB } = await import('@easybim/db')
    const ReportSchedule = (await import('@/app/models/ReportSchedule')).default
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const docs = await ReportSchedule.find({})
      .sort({ active: -1, nextRunAt: 1 })
      .lean() as unknown as Record<string, unknown>[]

    const projectIds = [...new Set(docs.map(d => String(d.projectId)))]
    const projects = await Project.find({ _id: { $in: projectIds } })
      .select('projectName projectNumber')
      .lean() as unknown as Record<string, unknown>[]
    const byId = new Map(projects.map(p => [String(p._id), {
      projectName: String(p.projectName ?? ''),
      projectNumber: String(p.projectNumber ?? ''),
    }]))

    return NextResponse.json({
      schedules: docs.map(d => serializeSchedule(d, byId.get(String(d.projectId)))),
    })
  } catch (err) {
    console.error('[GET /api/report-schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
