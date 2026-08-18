import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { parseScheduleInput, parseFrequency, serializeSchedule, nextRunFor } from '@/lib/server/scheduleDto'
import { recordRun } from '@/lib/server/scheduleRunner'

// Edit / pause / delete a schedule, plus "run now" for a one-off test send.
// Running builds a PDF with headless Chromium, so this needs the Node runtime
// and room to breathe.
export const runtime = 'nodejs'
export const maxDuration = 120

async function db() {
  const { connectDB } = await import('@easybim/db')
  const ReportSchedule = (await import('@/app/models/ReportSchedule')).default
  await connectDB()
  return ReportSchedule
}

type Ctx = { params: Promise<{ id: string; scheduleId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, scheduleId } = await params
  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const body = (raw ?? {}) as Record<string, unknown>

  try {
    const ReportSchedule = await db()
    const doc = await ReportSchedule.findOne({ _id: scheduleId, projectId: id })
    if (!doc) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

    // Pause / resume is a one-field PATCH; anything else is a full-form save.
    if (Object.keys(body).length === 1 && typeof body.active === 'boolean') {
      doc.active = body.active
      // Resuming from a pause: re-arm from now, never fire a backlog of missed runs.
      if (body.active) doc.nextRunAt = nextRunFor(parseFrequency(doc.frequency), doc.timezone)
      await doc.save()
      return NextResponse.json({ schedule: serializeSchedule(doc.toObject() as unknown as Record<string, unknown>) })
    }

    const parsed = parseScheduleInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const input = parsed.value

    Object.assign(doc, input)
    doc.nextRunAt = nextRunFor(input.frequency, input.timezone)
    await doc.save()
    return NextResponse.json({ schedule: serializeSchedule(doc.toObject() as unknown as Record<string, unknown>) })
  } catch (err) {
    console.error('[PATCH report-schedule]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, scheduleId } = await params
  try {
    const ReportSchedule = await db()
    const res = await ReportSchedule.deleteOne({ _id: scheduleId, projectId: id })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE report-schedule]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// POST = run this schedule right now (manual test). Uses the caller's identity
// as the acting user so a test always runs with tokens we know are fresh.
// nextRunAt is deliberately left alone — a test must not skip the next real send.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, scheduleId } = await params
  try {
    const ReportSchedule = await db()
    const doc = await ReportSchedule.findOne({ _id: scheduleId, projectId: id })
    if (!doc) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })

    const result = await recordRun(doc, { actingUserId: userId })
    return NextResponse.json({
      result,
      schedule: serializeSchedule(doc.toObject() as unknown as Record<string, unknown>),
    })
  } catch (err) {
    console.error('[POST report-schedule run]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
