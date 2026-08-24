import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { withMeCors } from '@/lib/server/meCors'
import type { TimeEntryDTO } from '@/lib/meTypes'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// userId → display name, so every entry is written self-describing (the
// project hours breakdown groups by name without a per-request Clerk join).
const nameCache = new Map<string, string>()
async function displayName(userId: string): Promise<string | undefined> {
  const hit = nameCache.get(userId)
  if (hit !== undefined) return hit || undefined
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
    nameCache.set(userId, name)
    return name || undefined
  } catch {
    return undefined
  }
}

async function db() {
  const { connectDB } = await import('@easybim/db')
  const TimeEntry = (await import('@/app/models/TimeEntry')).default
  await connectDB()
  return TimeEntry
}

// GET /api/me/time-entries?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns the signed-in user's entries in the inclusive date range.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return withMeCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const start = req.nextUrl.searchParams.get('start') ?? ''
  const end = req.nextUrl.searchParams.get('end') ?? ''
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return withMeCors(req, NextResponse.json({ error: 'start and end must be YYYY-MM-DD' }, { status: 400 }))
  }

  if (!process.env.MONGODB_URI) return withMeCors(req, NextResponse.json({ entries: [], mock: true }))

  try {
    const TimeEntry = await db()
    // Dates are plain YYYY-MM-DD strings, so lexicographic $gte/$lte is correct.
    const docs = await TimeEntry.find({ userId, date: { $gte: start, $lte: end } }).lean()
    const entries: TimeEntryDTO[] = docs.map((d) => ({
      date: d.date,
      projectKey: d.projectKey,
      projectName: d.projectName,
      hours: d.hours,
      subject: d.subject ?? '',
      subtopic: d.subtopic ?? '',
      eventIds: d.eventIds,
    }))
    return withMeCors(req, NextResponse.json({ entries }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/me/time-entries]', err)
    return withMeCors(req, NextResponse.json({ error: msg }, { status: 500 }))
  }
}

// POST /api/me/time-entries
// Body: { date, projectKey, projectName?, subject?, subtopic?, hours, add?, eventId? }
// Default: upserts one category entry (user × project × day × subject × subtopic);
// hours <= 0 deletes it. add: true — increments the entry instead (used when
// logging a calendar event on top of existing hours), tagging it with the event id.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { date?: string; projectKey?: string; projectName?: string; hours?: number; add?: boolean; eventId?: string; subject?: string; subtopic?: string } | null
  const date = body?.date ?? ''
  const projectKey = (body?.projectKey ?? '').trim()
  const hours = Number(body?.hours)
  const add = body?.add === true
  const eventId = typeof body?.eventId === 'string' && body.eventId ? body.eventId : undefined
  const subject = typeof body?.subject === 'string' ? body.subject.slice(0, 60) : ''
  const subtopic = typeof body?.subtopic === 'string' ? body.subtopic.slice(0, 60) : ''

  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  if (!projectKey) return NextResponse.json({ error: 'projectKey is required' }, { status: 400 })
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return NextResponse.json({ error: 'hours must be a number between 0 and 24' }, { status: 400 })
  }
  if (add && hours <= 0) {
    return NextResponse.json({ error: 'add requires hours > 0' }, { status: 400 })
  }

  if (!process.env.MONGODB_URI) return NextResponse.json({ ok: true, mock: true })

  try {
    const TimeEntry = await db()
    const filter = { userId, projectKey, date, subject, subtopic }
    if (!add && hours === 0) {
      await TimeEntry.deleteOne(filter)
      return NextResponse.json({ ok: true, deleted: true })
    }
    const { Types } = await import('mongoose')
    const projectId = Types.ObjectId.isValid(projectKey) ? new Types.ObjectId(projectKey) : undefined

    const userName = await displayName(userId)
    const common = { projectName: body?.projectName, ...(projectId ? { projectId } : {}), ...(userName ? { userName } : {}) }
    const update = add
      ? {
          $inc: { hours },
          $set: common,
          ...(eventId ? { $addToSet: { eventIds: eventId } } : {}),
          $setOnInsert: { source: 'calendar' },
        }
      : {
          $set: { hours, ...common },
          $setOnInsert: { source: 'manual' },
        }

    const doc = await TimeEntry.findOneAndUpdate(filter, update, { upsert: true, new: true, runValidators: true })
    return NextResponse.json({ ok: true, hours: doc?.hours ?? hours })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/me/time-entries]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
