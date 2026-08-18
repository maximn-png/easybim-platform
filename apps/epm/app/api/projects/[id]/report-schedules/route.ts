import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { parseScheduleInput, serializeSchedule, nextRunFor } from '@/lib/server/scheduleDto'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import { readApsRefreshCookie } from '@/lib/services/apsUserToken'
import { saveApsRefreshToken } from '@/lib/server/apsTokenStore'

export const runtime = 'nodejs'

// Report schedules for one project. Internal EPM users only — ANA clients never
// reach this path (see the allow-list in proxy.ts).

async function db() {
  const { connectDB } = await import('@easybim/db')
  const ReportSchedule = (await import('@/app/models/ReportSchedule')).default
  await connectDB()
  return ReportSchedule
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.MONGODB_URI) return NextResponse.json({ schedules: [] })

  const { id } = await params
  try {
    const ReportSchedule = await db()
    const docs = await ReportSchedule.find({ projectId: id })
      .sort({ active: -1, nextRunAt: 1 })
      .lean() as unknown as Record<string, unknown>[]
    return NextResponse.json({ schedules: docs.map(d => serializeSchedule(d)) })
  } catch (err) {
    console.error('[GET report-schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// A schedule runs later, with no browser attached — so at creation time we copy
// this browser's Autodesk refresh token into the persisted store. Users who
// connected Autodesk before schedules existed are covered without re-auth.
async function backfillApsToken(userId: string, projectId: string) {
  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()
    const doc = await Project.findById(projectId).select('externalIds').lean() as Record<string, unknown> | null
    const ext = (doc?.externalIds ?? {}) as Record<string, unknown>
    const hub = ext.accExternalHub ? getPartnerHubByAccountId(ext.accHubId as string | undefined) : null
    const refresh = await readApsRefreshCookie(hub)
    if (refresh) await saveApsRefreshToken(userId, refresh, hub)
  } catch (err) {
    console.warn('[report-schedules] APS token backfill failed:', err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { id } = await params

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = parseScheduleInput(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const input = parsed.value

  let ownerName: string | undefined
  let ownerEmail: string | undefined
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    ownerName = [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined
    ownerEmail = user.primaryEmailAddress?.emailAddress
  } catch { /* optional */ }

  try {
    const ReportSchedule = await db()
    const doc = await ReportSchedule.create({
      ...input,
      projectId: id,
      ownerUserId: userId,
      ownerName,
      ownerEmail,
      nextRunAt: nextRunFor(input.frequency, input.timezone),
    })
    await backfillApsToken(userId, id)
    return NextResponse.json({ schedule: serializeSchedule(doc.toObject() as unknown as Record<string, unknown>) })
  } catch (err) {
    console.error('[POST report-schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
