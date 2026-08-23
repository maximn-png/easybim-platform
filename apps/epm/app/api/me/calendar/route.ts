import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserGoogleToken } from '@/lib/services/gmailService'
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

    const events: CalendarEventDTO[] = []
    for (const ev of json.items ?? []) {
      if (ev.status === 'cancelled') continue
      // Skip events this user declined.
      const selfAttendee = ev.attendees?.find((a) => a.self)
      if (selfAttendee?.responseStatus === 'declined') continue

      if (ev.start?.dateTime && ev.end?.dateTime) {
        const s = new Date(ev.start.dateTime)
        const e = new Date(ev.end.dateTime)
        const day = localYMD(s)
        if (day < start || day > end) continue
        const durationHours = Math.round(((e.getTime() - s.getTime()) / 3_600_000) * 4) / 4
        events.push({
          id: ev.id,
          title: ev.summary || '(no title)',
          day,
          startTime: localHM(s),
          durationHours: Math.min(Math.max(durationHours, 0.25), 24),
          allDay: false,
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
