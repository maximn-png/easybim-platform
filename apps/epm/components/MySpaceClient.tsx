'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import {
  AlertCircle, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3,
  ExternalLink, FolderKanban, Info, Loader2, Plus, Sparkles, X,
} from 'lucide-react'
import type { CalendarEventDTO, CalendarResponse, MeOverview, MyProject, TimeEntryDTO } from '@/lib/meTypes'

const INTERNAL_KEY = 'internal'
const INTERNAL_NAME = 'EasyBIM internal'
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ---- local-date helpers (the grid works in plain YYYY-MM-DD strings) ---- */
function toYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function weekStartOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - x.getDay()) // back to Sunday
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

interface GridRow {
  projectKey: string
  projectName: string
  projectNumber?: string
  subLabel?: string
}

const cellKey = (projectKey: string, date: string) => `${projectKey}|${date}`

export default function MySpaceClient({ userName }: { userName: string }) {
  const { user } = useUser()
  const [overview, setOverview] = useState<MeOverview | null>(null)
  const [entries, setEntries] = useState<Record<string, number>>({})
  const [entryNames, setEntryNames] = useState<Record<string, string>>({})
  const [loggedEventIds, setLoggedEventIds] = useState<Set<string>>(new Set())
  const [extraRows, setExtraRows] = useState<GridRow[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => weekStartOf(new Date()))
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null)
  const [calReload, setCalReload] = useState(0)
  const [logEvent, setLogEvent] = useState<CalendarEventDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toYMD(addDays(weekStart, i))),
    [weekStart]
  )
  const today = toYMD(new Date())

  useEffect(() => {
    fetch('/api/me/overview')
      .then((r) => r.json() as Promise<{ overview?: MeOverview; error?: string }>)
      .then((data) => {
        if (data.error) setError(data.error)
        else setOverview(data.overview ?? null)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true)
    try {
      const res = await fetch(`/api/me/time-entries?start=${days[0]}&end=${days[6]}`)
      const data = await res.json() as { entries?: TimeEntryDTO[]; error?: string }
      if (data.error) { setError(data.error); return }
      const map: Record<string, number> = {}
      const names: Record<string, string> = {}
      const logged = new Set<string>()
      for (const e of data.entries ?? []) {
        map[cellKey(e.projectKey, e.date)] = e.hours
        if (e.projectName) names[e.projectKey] = e.projectName
        for (const id of e.eventIds ?? []) logged.add(id)
      }
      setEntries(map)
      setEntryNames(names)
      setLoggedEventIds(logged)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setEntriesLoading(false)
    }
  }, [days])

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    setCalendar(null)
    fetch(`/api/me/calendar?start=${days[0]}&end=${days[6]}`)
      .then((r) => r.json() as Promise<CalendarResponse>)
      .then(setCalendar)
      .catch(() => setCalendar({ connected: false, reason: 'error' }))
  }, [days, calReload])

  /* Rows = my projects + rows only present in saved entries + manually added + internal. */
  const rows: GridRow[] = useMemo(() => {
    const list: GridRow[] = (overview?.myProjects ?? [])
      .filter((p) => p.status.toLowerCase() !== 'done')
      .map((p) => ({
        projectKey: p._id,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        subLabel: p.roles.join(' · '),
      }))
    const seen = new Set(list.map((r) => r.projectKey))
    for (const r of extraRows) {
      if (!seen.has(r.projectKey)) { list.push(r); seen.add(r.projectKey) }
    }
    for (const key of Object.keys(entries)) {
      const [projectKey] = key.split('|')
      if (projectKey === INTERNAL_KEY || seen.has(projectKey)) continue
      list.push({ projectKey, projectName: entryNames[projectKey] ?? 'Project', subLabel: 'from entries' })
      seen.add(projectKey)
    }
    list.push({ projectKey: INTERNAL_KEY, projectName: INTERNAL_NAME, subLabel: 'General' })
    return list
  }, [overview, extraRows, entries, entryNames])

  const myProjectById = useMemo(() => {
    const m = new Map<string, MyProject>()
    for (const p of overview?.myProjects ?? []) m.set(p._id, p)
    return m
  }, [overview])

  const saveCell = useCallback(async (row: GridRow, date: string, hours: number) => {
    const key = cellKey(row.projectKey, date)
    const prev = entries[key] ?? 0
    if (hours === prev) return
    // Optimistic update; revert on failure.
    setEntries((m) => {
      const next = { ...m }
      if (hours === 0) delete next[key]
      else next[key] = hours
      return next
    })
    setSaving((n) => n + 1)
    try {
      const res = await fetch('/api/me/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, projectKey: row.projectKey, projectName: row.projectName, hours }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
    } catch (e) {
      setEntries((m) => {
        const next = { ...m }
        if (prev === 0) delete next[key]
        else next[key] = prev
        return next
      })
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving((n) => n - 1)
    }
  }, [entries])

  // Log a calendar event as hours: increments the day cell and tags the event.
  const logEventHours = useCallback(async (event: CalendarEventDTO, projectKey: string, projectName: string, hours: number) => {
    setSaving((n) => n + 1)
    try {
      const res = await fetch('/api/me/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: event.day, projectKey, projectName, hours, add: true, eventId: event.id }),
      })
      const data = await res.json() as { ok?: boolean; hours?: number; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
      const key = cellKey(projectKey, event.day)
      setEntries((m) => ({ ...m, [key]: data.hours ?? (m[key] ?? 0) + hours }))
      setLoggedEventIds((s) => new Set(s).add(event.id))
      setLogEvent(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving((n) => n - 1)
    }
  }, [])

  // Incremental Google consent: reauthorize the connected Google account with
  // the extra calendar scope and send the browser to Google's consent screen.
  // Google redirects back here; the calendar then loads with the new token.
  const grantCalendarAccess = useCallback(async () => {
    const google = user?.externalAccounts.find((a) => a.provider === 'google')
    if (!google) {
      setError('No Google connection found on your account — sign in with Google first.')
      return
    }
    try {
      const res = await google.reauthorize({
        additionalScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        redirectUrl: window.location.href,
      })
      const url = res.verification?.externalVerificationRedirectURL
      if (url) window.location.href = url.toString()
      else setError('Google did not return a consent URL — try again.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [user])

  const dayTotals = days.map((d) => rows.reduce((s, r) => s + (entries[cellKey(r.projectKey, d)] ?? 0), 0))
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0)
  const expected = overview?.kpis.expectedWeeklyHours ?? 40

  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  const firstName = userName.split(' ')[0] || 'there'

  return (
    <div className="max-w-6xl w-full mx-auto">
      {/* breadcrumb + greeting */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <Link href="/dashboard" className="hover:text-[#1e248c]">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-[#1e248c] font-medium">My Space</span>
      </div>
      <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
        <h1 className="text-3xl font-bold text-[#1e248c]">Good morning, {firstName}</h1>
        {saving > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <Loader2 size={12} className="animate-spin" /> saving…
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiTile
          icon={<Clock3 size={14} />}
          value={entriesLoading ? '…' : `${weekTotal} / ${expected}`}
          label="hours logged this week"
          sub="160h /month"
        />
        <KpiTile
          icon={<AlertCircle size={14} />}
          value={loading ? '…' : String(overview?.kpis.myActiveIssues ?? 0)}
          label="ACC issues to deal"
        />
        <KpiTile
          icon={<FolderKanban size={14} />}
          value={loading ? '…' : String(overview?.kpis.myProjectCount ?? 0)}
          label="active projects"
        />
        <KpiTile
          icon={<CalendarDays size={14} />}
          value={calendar?.events ? String(calendar.events.filter((e) => !loggedEventIds.has(e.id) && !e.allDay).length) : '…'}
          label="calendar events to log"
        />
      </div>

      {/* week grid + issues, merged */}
      <section id="time" className="glass-card rounded-2xl p-4 scroll-mt-20 mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2">
            <Clock3 size={14} /> This week · {weekLabel}
          </h2>
          <div className="flex items-center gap-1">
            <WeekNavButton onClick={() => setWeekStart((w) => addDays(w, -7))} title="Previous week">
              <ChevronLeft size={13} />
            </WeekNavButton>
            <button
              onClick={() => setWeekStart(weekStartOf(new Date()))}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
            >
              Today
            </button>
            <WeekNavButton onClick={() => setWeekStart((w) => addDays(w, 7))} title="Next week">
              <ChevronRight size={13} />
            </WeekNavButton>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-semibold text-gray-500 border border-[#e8eaff] bg-[#f0f3ff] px-2 py-1.5">Project</th>
                {days.map((d, i) => (
                  <th
                    key={d}
                    className={`text-[10px] font-semibold border border-[#e8eaff] px-1 py-1.5 w-[52px] ${
                      d === today ? 'bg-[#e7eefe] text-[#1e248c]' : i >= 5 ? 'bg-gray-50 text-gray-400' : 'bg-[#f0f3ff] text-gray-500'
                    }`}
                  >
                    {DAY_LABELS[i]} {Number(d.slice(8))}
                  </th>
                ))}
                <th className="text-[10px] font-semibold text-[#1e248c] border border-[#e8eaff] bg-[#e7eefe] px-1 py-1.5 w-[48px]">Total</th>
                <th className="text-[10px] font-semibold text-gray-500 border border-[#e8eaff] bg-[#f0f3ff] px-1 py-1.5 w-[64px]">Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowTotal = days.reduce((s, d) => s + (entries[cellKey(row.projectKey, d)] ?? 0), 0)
                return (
                  <tr key={row.projectKey}>
                    <td className="border border-[#e8eaff] px-2 py-1">
                      <div className="text-[11px] font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">
                        {row.projectNumber && (
                          <span className="font-mono text-[10px] text-[#44b8d3] mr-1">{row.projectNumber}</span>
                        )}
                        <bdi>{row.projectName}</bdi>
                      </div>
                      {row.subLabel && <div className="text-[9px] text-gray-400">{row.subLabel}</div>}
                    </td>
                    {days.map((d, i) => (
                      <HourCell
                        key={d}
                        value={entries[cellKey(row.projectKey, d)] ?? 0}
                        weekend={i >= 5}
                        isToday={d === today}
                        onCommit={(h) => saveCell(row, d, h)}
                      />
                    ))}
                    <td className="border border-[#e8eaff] bg-[#e7eefe] text-center text-[11px] font-bold text-[#1e248c] tabular-nums">
                      {rowTotal || ''}
                    </td>
                    <td className="border border-[#e8eaff] text-center px-1">
                      <IssueStatBadge project={myProjectById.get(row.projectKey)} />
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td className="border border-[#e8eaff] bg-[#f0f3ff] px-2 py-1.5 text-[11px] font-bold text-gray-700">Day total</td>
                {dayTotals.map((t, i) => (
                  <td key={days[i]} className="border border-[#e8eaff] bg-[#f0f3ff] text-center text-[11px] font-bold text-gray-700 tabular-nums">
                    {t || ''}
                  </td>
                ))}
                <td className={`border border-[#e8eaff] bg-[#e7eefe] text-center text-[12px] font-bold tabular-nums ${weekTotal > expected ? 'text-amber-600' : 'text-[#1e248c]'}`}>
                  {weekTotal}
                </td>
                <td className="border border-[#e8eaff] bg-[#f0f3ff]" />
              </tr>
            </tbody>
          </table>
        </div>

        {/* add project row */}
        <div className="mt-2 relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
          >
            <Plus size={12} /> Add project row
          </button>
          {pickerOpen && overview && (
            <div className="absolute z-20 mt-1 w-72 max-h-64 overflow-y-auto bg-white rounded-xl border border-[#e8eaff] shadow-lg p-1">
              {overview.allProjects
                .filter((p) => !rows.some((r) => r.projectKey === p._id))
                .map((p) => (
                  <button
                    key={p._id}
                    onClick={() => {
                      setExtraRows((xs) => [...xs, { projectKey: p._id, projectName: p.projectName, projectNumber: p.projectNumber }])
                      setPickerOpen(false)
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-gray-700 hover:bg-blue-50"
                  >
                    <span className="font-mono text-[10px] text-[#44b8d3] mr-1.5">{p.projectNumber}</span>
                    <bdi>{p.projectName}</bdi>
                  </button>
                ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* calendar */}
        <section id="calendar" className="lg:col-span-8 glass-card rounded-2xl p-4 scroll-mt-20">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-3">
            <CalendarDays size={14} /> My calendar
            <span className="text-[10px] font-normal text-gray-400">click an event to log it as working hours</span>
          </h2>
          <CalendarWeek
            calendar={calendar}
            days={days}
            today={today}
            loggedEventIds={loggedEventIds}
            onPick={setLogEvent}
            onGrantAccess={grantCalendarAccess}
            onRetry={() => setCalReload((n) => n + 1)}
          />
        </section>

        {/* knowledge */}
        <section id="knowledge" className="lg:col-span-4 glass-card rounded-2xl p-4 scroll-mt-20">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-2">
            <BookOpen size={14} /> Knowledge Center
          </h2>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Your reading confirmations, courses and quizzes will appear here once the
            Knowledge Center publishes per-user obligations.
          </p>
          <a
            href="https://knowledge.easybim.co.il"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
          >
            Open Knowledge Center <ExternalLink size={11} />
          </a>
        </section>
      </div>

      {logEvent && (
        <LogEventModal
          event={logEvent}
          rows={rows}
          onClose={() => setLogEvent(null)}
          onSave={logEventHours}
        />
      )}
    </div>
  )
}

/* ---------------- pieces ---------------- */

function KpiTile({ icon, value, label, sub }: { icon: React.ReactNode; value: string; label: string; sub?: string }) {
  return (
    <div className="glass-card rounded-xl p-3 relative">
      {sub && (
        <span className="absolute top-2 right-2 text-[9px] font-semibold text-[#44b8d3] bg-[#e7eefe] rounded-full px-2 py-0.5">{sub}</span>
      )}
      <div className="w-7 h-7 rounded-lg text-white flex items-center justify-center mb-2"
        style={{ background: 'linear-gradient(135deg, #1e248c 0%, #44b8d3 100%)' }}>
        {icon}
      </div>
      <div className="text-xl font-bold text-[#1e248c] tabular-nums leading-tight">{value}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  )
}

function WeekNavButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 rounded-full bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors flex items-center justify-center"
    >
      {children}
    </button>
  )
}

function HourCell({ value, weekend, isToday, onCommit }: {
  value: number
  weekend: boolean
  isToday: boolean
  onCommit: (hours: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value ? String(value) : '')
  const commit = () => {
    if (draft === null) return
    const n = draft.trim() === '' ? 0 : Number(draft)
    setDraft(null)
    if (Number.isFinite(n) && n >= 0 && n <= 24) onCommit(Math.round(n * 4) / 4)
  }
  return (
    <td className={`border border-[#e8eaff] p-0 ${isToday ? 'bg-[#e7eefe]/60' : weekend ? 'bg-gray-50/60' : ''}`}>
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        placeholder="–"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className={`w-full h-full px-1 py-1.5 text-center text-[11px] tabular-nums bg-transparent outline-none
          focus:bg-white focus:ring-1 focus:ring-[#44b8d3] rounded-none
          ${value ? 'text-gray-800 font-semibold' : 'text-gray-300'} placeholder:text-gray-200`}
      />
    </td>
  )
}

// The same "completed/active" green pill as the dashboard projects table,
// linking to the project's issues page filtered to this user as creator.
function IssueStatBadge({ project }: { project?: MyProject }) {
  if (!project || (project.myActiveIssues === 0 && project.myCompletedIssues === 0)) return null
  const href = project.myCreatorName
    ? `/dashboard/${project._id}/reports?createdBy=${encodeURIComponent(project.myCreatorName)}`
    : `/dashboard/${project._id}/reports`
  return (
    <Link
      href={href}
      title={`${project.myCompletedIssues} completed of ${project.myActiveIssues} issues you created (all statuses except closed) — click to open the issues page filtered to you`}
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-50 border border-green-200 text-green-700 text-[10px] font-semibold leading-none whitespace-nowrap tabular-nums hover:bg-green-100 transition-colors"
    >
      {project.myCompletedIssues}/{project.myActiveIssues}
      <Info size={9} className="text-green-600/70 shrink-0" />
    </Link>
  )
}

/* ---------------- calendar ---------------- */

function CalendarWeek({ calendar, days, today, loggedEventIds, onPick, onGrantAccess, onRetry }: {
  calendar: CalendarResponse | null
  days: string[]
  today: string
  loggedEventIds: Set<string>
  onPick: (e: CalendarEventDTO) => void
  onGrantAccess: () => void
  onRetry: () => void
}) {
  if (!calendar) {
    return (
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-[#eef0fb]" />)}
      </div>
    )
  }
  if (!calendar.connected) {
    return (
      <div className="text-[11px] text-gray-600 bg-[#f0f3ff] border border-[#e8eaff] rounded-xl px-3 py-3 leading-relaxed">
        {calendar.reason === 'scope' || calendar.reason === 'not-connected' ? (
          <>
            <p className="mb-3">
              {calendar.reason === 'scope'
                ? "Your Google account hasn't shared calendar access yet."
                : 'Your Google connection needs to be (re)authorized — a previous authorization was started but not finished.'}{' '}
              Click below — Google will ask you to approve read-only calendar access
              (make sure to complete the whole consent screen), then send you right back here.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onGrantAccess}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-white bg-[#1e248c] hover:bg-[#333a9f] transition-colors"
              >
                Grant calendar access
              </button>
              <button
                onClick={onRetry}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-white border border-[#e8eaff] text-[#1e248c] hover:bg-blue-50 transition-colors"
              >
                Check again
              </button>
            </div>
          </>
        ) : (
          <>Couldn&apos;t load your calendar{calendar.message ? `: ${calendar.message}` : ''}. Try refreshing.</>
        )}
      </div>
    )
  }

  const byDay = new Map<string, CalendarEventDTO[]>()
  for (const ev of calendar.events ?? []) {
    const list = byDay.get(ev.day) ?? []
    list.push(ev)
    byDay.set(ev.day, list)
  }

  return (
    <div className="grid grid-cols-7 gap-1.5 min-w-[640px] overflow-x-auto">
      {days.map((d, i) => (
        <div key={d} className={`rounded-lg border ${d === today ? 'border-[#44b8d3] bg-[#e7eefe]/40' : 'border-[#eef0fb] bg-white/50'} p-1.5 min-h-[110px]`}>
          <div className={`text-[9px] font-semibold mb-1 ${d === today ? 'text-[#1e248c]' : 'text-gray-400'}`}>
            {DAY_LABELS[i]} {Number(d.slice(8))}
          </div>
          <div className="space-y-1">
            {(byDay.get(d) ?? []).map((ev) => {
              const logged = loggedEventIds.has(ev.id)
              return (
                <button
                  key={ev.id}
                  onClick={() => !logged && !ev.allDay && onPick(ev)}
                  disabled={logged || ev.allDay}
                  title={logged ? 'Already logged as working hours' : ev.allDay ? 'All-day event' : `Log "${ev.title}" as working hours`}
                  className={`w-full text-left rounded-md px-1.5 py-1 border text-[9px] leading-tight transition-colors ${
                    logged
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : ev.allDay
                        ? 'bg-gray-50 border-gray-200 text-gray-400'
                        : 'bg-[#e7eefe] border-[#c5caff] text-[#1e248c] hover:bg-[#dbe4fd] cursor-pointer'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {logged && <Check size={9} className="shrink-0" />}
                    <span className="font-semibold truncate">{ev.title}</span>
                  </span>
                  <span className="text-[8px] opacity-70 tabular-nums">
                    {ev.allDay ? 'all day' : `${ev.startTime} · ${ev.durationHours}h`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function LogEventModal({ event, rows, onClose, onSave }: {
  event: CalendarEventDTO
  rows: GridRow[]
  onClose: () => void
  onSave: (event: CalendarEventDTO, projectKey: string, projectName: string, hours: number) => Promise<void>
}) {
  const [projectKey, setProjectKey] = useState(rows[0]?.projectKey ?? INTERNAL_KEY)
  const [hours, setHours] = useState(String(event.durationHours || 1))
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const n = Number(hours)
    if (!Number.isFinite(n) || n <= 0 || n > 24) return
    const row = rows.find((r) => r.projectKey === projectKey)
    setBusy(true)
    try {
      await onSave(event, projectKey, row?.projectName ?? INTERNAL_NAME, Math.round(n * 4) / 4)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-[#e8eaff] w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-[#1e248c]">Log as working hours</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {event.title} · {event.day} {event.startTime ? `· ${event.startTime}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>

        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Project</label>
        <select
          value={projectKey}
          onChange={(e) => setProjectKey(e.target.value)}
          className="w-full text-[11px] border border-[#e8eaff] rounded-lg px-2 py-1.5 mb-3 bg-white outline-none focus:ring-1 focus:ring-[#44b8d3]"
        >
          {rows.map((r) => (
            <option key={r.projectKey} value={r.projectKey}>
              {r.projectNumber ? `${r.projectNumber} — ` : ''}{r.projectName}
            </option>
          ))}
        </select>

        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Hours</label>
        <input
          type="text"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-full text-[11px] border border-[#e8eaff] rounded-lg px-2 py-1.5 mb-4 outline-none focus:ring-1 focus:ring-[#44b8d3] tabular-nums"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold text-white bg-[#1e248c] hover:bg-[#333a9f] transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            Log hours
          </button>
        </div>
      </div>
    </div>
  )
}
