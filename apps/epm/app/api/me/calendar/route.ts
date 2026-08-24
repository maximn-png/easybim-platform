import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getUserGoogleToken } from '@/lib/services/gmailService'
import { matchProjectsToTitle, normalizeTitleKey, type MatchableProject } from '@/lib/eventMatch'
import { samePerson } from '@/lib/people'
import type { CalendarEventDTO, CalendarResponse } from '@/lib/meTypes'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TZ = 'Asia/Jerusalem'

// Renders a Date as YYYY-MM-DD / HH:mm in the company timezone. The grid works
// in local calendar days, so events are bucketed the way the team sees them.
function localYMD(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function localHM(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ self?: boolean; responseStatus?: string }>
  organizer?: { self?: boolean }
}

// Projects the title matcher runs against, flagged with whether the signed-in
// user is on the team (used to break ambiguous-token ties).
async function loadMatchableProjects(userId: string): Promise<MatchableProject[]> {
  if (!process.env.MONGODB_URI) return []
  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    let me = { name: '', email: null as string | null }
    try {
      const user = await (await clerkClient()).users.getUser(userId)
      me = {
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        email: user.primaryEmailAddress?.emailAddress ?? null,
      }
    } catch { /* tie-breaking just loses the "mine" preference */ }

    const docs = await Project.find({}).lean()
    return docs
      // Only projects currently in work — matching against the whole historic
      // registry produces stale hits.
      .filter((doc) => (doc.snapshot?.status ?? '').trim().toLowerCase() === 'working on it')
      .map((doc) => {
        const s = doc.snapshot
        const mine = [s?.bimManager, s?.mepCoordinator, s?.bimModeller].some((m) => samePerson(m, me))
        return {
          _id: String(doc._id),
          projectName: doc.projectName ?? '',
          projectNumber: doc.projectNumber ?? '',
          active: true,
          mine,
        }
      })
  } catch (err) {
    console.warn('[GET /api/me/calendar] project matching unavailable:', err)
    return []
  }
}

// GET /api/me/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// The signed-in user's primary Google Calendar events in the inclusive local
// date range, via the Google OAuth token Clerk stores for them (same mechanism
// as the Gmail report drafts). Requires the calendar.readonly scope on the
// Clerk Google connection.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const start = req.nextUrl.searchParams.get('start') ?? ''
  const end = req.nextUrl.searchParams.get('end') ?? ''
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: 'start and end must be YYYY-MM-DD' }, { status: 400 })
  }

  const token = await getUserGoogleToken(userId)
  if (!token) {
    const res: CalendarResponse = { connected: false, reason: 'not-connected' }
    return NextResponse.json(res)
  }

  try {
    // ±1 day around the range so timezone offsets can't drop edge events;
    // exact filtering happens below on the local day.
    const timeMin = new Date(`${start}T00:00:00Z`)
    timeMin.setUTCDate(timeMin.getUTCDate() - 1)
    const timeMax = new Date(`${end}T00:00:00Z`)
    timeMax.setUTCDate(timeMax.getUTCDate() + 2)

    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })
    const apiRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (apiRes.status === 401 || apiRes.status === 403) {
      const body = await apiRes.text()
      console.warn('[GET /api/me/calendar] google rejected token:', apiRes.status, body.slice(0, 200))
      // Not a consent problem: the Calendar API itself is switched off in the
      // Google Cloud project that hosts the OAuth client.
      if (body.includes('accessNotConfigured') || body.includes('has not been used in project')) {
        const res: CalendarResponse = {
          connected: false,
          reason: 'error',
          message:
            'the Google Calendar API is disabled in the company Google Cloud project. An admin must enable it once (Google Cloud console → APIs & Services → Library → Google Calendar API → Enable), then try again in a minute',
        }
        return NextResponse.json(res)
      }
      const res: CalendarResponse = { connected: false, reason: 'scope' }
      return NextResponse.json(res)
    }
    if (!apiRes.ok) {
      const body = await apiRes.text()
      throw new Error(`Google Calendar ${apiRes.status}: ${body.slice(0, 200)}`)
    }
    const json = await apiRes.json() as { items?: GoogleEvent[] }
    const projects = await loadMatchableProjects(userId)

    // "For all future meetings" rules: titleKey → user-confirmed projects.
    const rules = new Map<string, Array<{ projectId: string; projectName: string; projectNumber: string }>>()
    if (process.env.MONGODB_URI) {
      try {
        const MeetingRule = (await import('@/app/models/MeetingRule')).default
        for (const r of await MeetingRule.find({ userId }).lean()) {
          rules.set(r.titleKey, r.projects.map((p) => ({
            projectId: p.projectKey, projectName: p.projectName, projectNumber: p.projectNumber,
          })))
        }
      } catch (err) {
        console.warn('[GET /api/me/calendar] meeting rules unavailable:', err)
      }
    }

    const events: CalendarEventDTO[] = []
    for (const ev of json.items ?? []) {
      if (ev.status === 'cancelled') continue
      // Only events the user is actually going to: their own events (organizer
      // or no invitees) or invitations they explicitly accepted.
      const selfAttendee = ev.attendees?.find((a) => a.self)
      const going =
        ev.organizer?.self === true ||
        !ev.attendees?.length ||
        selfAttendee?.responseStatus === 'accepted'
      if (!going) continue

      if (ev.start?.dateTime && ev.end?.dateTime) {
        const s = new Date(ev.start.dateTime)
        const e = new Date(ev.end.dateTime)
        const day = localYMD(s)
        if (day < start || day > end) continue
        const durationHours = Math.round(((e.getTime() - s.getTime()) / 3_600_000) * 4) / 4
        const title = ev.summary || '(no title)'
        // A user-confirmed rule for this title beats the heuristic matcher.
        const ruled = rules.get(normalizeTitleKey(title))
        events.push({
          id: ev.id,
          title,
          day,
          startTime: localHM(s),
          durationHours: Math.min(Math.max(durationHours, 0.25), 24),
          allDay: false,
          matches: ruled ?? matchProjectsToTitle(title, projects),
        })
      } else if (ev.start?.date) {
        const day = ev.start.date
        if (day < start || day > end) continue
        events.push({ id: ev.id, title: ev.summary || '(no title)', day, startTime: null, durationHours: 0, allDay: true })
      }
    }

    const res: CalendarResponse = { connected: true, events }
    return NextResponse.json(res)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/me/calendar]', err)
    const res: CalendarResponse = { connected: false, reason: 'error', message: msg }
    return NextResponse.json(res, { status: 500 })
  }
}
