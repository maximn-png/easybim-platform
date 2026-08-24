'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock3,
  BarChart3, Loader2, Plus, Repeat, X,
} from 'lucide-react'
import type { CalendarEventDTO, CalendarResponse, MeOverview, MyProject, TimeEntryDTO } from '@/lib/meTypes'
import { ROLE_SUBJECT, TAXONOMY } from '@/lib/meTypes'

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

// One category slot of a grid cell (a cell = the sum of its slots).
interface CellEntry {
  subject: string
  subtopic: string
  hours: number
}

interface Allocation {
  projectKey: string
  projectName: string
  hours: number
  subject: string
  subtopic: string
}

interface ProjectOptionRow {
  projectKey: string
  projectName: string
  projectNumber: string
}

const HIDDEN_ROWS_LS = 'epm:mySpaceHiddenRows'

const cellKey = (projectKey: string, date: string) => `${projectKey}|${date}`
const cellTotal = (list: CellEntry[] | undefined) => (list ?? []).reduce((s, e) => s + e.hours, 0)
const round25 = (n: number) => Math.round(n * 4) / 4

export default function SubmitHoursClient() {
  const { user } = useUser()
  const [overview, setOverview] = useState<MeOverview | null>(null)
  const [cells, setCells] = useState<Record<string, CellEntry[]>>({})
  const [entryNames, setEntryNames] = useState<Record<string, string>>({})
  const [loggedEventIds, setLoggedEventIds] = useState<Set<string>>(new Set())
  const [extraRows, setExtraRows] = useState<GridRow[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => weekStartOf(new Date()))
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null)
  const [calReload, setCalReload] = useState(0)
  const [logEvent, setLogEvent] = useState<CalendarEventDTO | null>(null)
  const [cellEdit, setCellEdit] = useState<{ row: GridRow; date: string } | null>(null)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const pickerRef = useRef<HTMLDivElement>(null)

  // Hidden rows persist per browser (removal never deletes saved hours).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_ROWS_LS)
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]))
    } catch { /* corrupted value — start clean */ }
  }, [])
  const persistHidden = (next: Set<string>) => {
    setHidden(next)
    try { localStorage.setItem(HIDDEN_ROWS_LS, JSON.stringify([...next])) } catch { }
  }

  // Close the add-project picker on click-outside / Escape.
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

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
  }, [])

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true)
    try {
      const res = await fetch(`/api/me/time-entries?start=${days[0]}&end=${days[6]}`)
      const data = await res.json() as { entries?: TimeEntryDTO[]; error?: string }
      if (data.error) { setError(data.error); return }
      const map: Record<string, CellEntry[]> = {}
      const names: Record<string, string> = {}
      const logged = new Set<string>()
      for (const e of data.entries ?? []) {
        const key = cellKey(e.projectKey, e.date)
        const list = map[key] ?? (map[key] = [])
        list.push({ subject: e.subject ?? '', subtopic: e.subtopic ?? '', hours: e.hours })
        if (e.projectName) names[e.projectKey] = e.projectName
        for (const id of e.eventIds ?? []) logged.add(id)
      }
      setCells(map)
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

  /* Rows = my projects + rows only present in saved entries + manually added
     (minus hidden ones) + internal. */
  const rows: GridRow[] = useMemo(() => {
    const list: GridRow[] = (overview?.myProjects ?? [])
      .filter((p) => p.status.toLowerCase() !== 'done' && !hidden.has(p._id))
      .map((p) => ({
        projectKey: p._id,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        subLabel: p.roles.join(' · '),
      }))
    const seen = new Set(list.map((r) => r.projectKey))
    for (const r of extraRows) {
      if (!seen.has(r.projectKey) && !hidden.has(r.projectKey)) { list.push(r); seen.add(r.projectKey) }
    }
    for (const key of Object.keys(cells)) {
      const [projectKey] = key.split('|')
      if (projectKey === INTERNAL_KEY || seen.has(projectKey) || hidden.has(projectKey)) continue
      // Rows born from calendar approvals: resolve the clean name + number
      // from the project registry, not from whatever the entry happened to store.
      const known = overview?.allProjects.find((p) => p._id === projectKey)
      list.push({
        projectKey,
        projectName: known?.projectName ?? entryNames[projectKey] ?? 'Unknown project',
        projectNumber: known?.projectNumber,
        subLabel: 'added from calendar',
      })
      seen.add(projectKey)
    }
    if (sortDir) {
      const num = (r: GridRow) => parseInt((r.projectNumber ?? '').replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER
      list.sort((a, b) => {
        const d = num(a) - num(b) || a.projectName.localeCompare(b.projectName)
        return sortDir === 'asc' ? d : -d
      })
    }
    list.push({ projectKey: INTERNAL_KEY, projectName: INTERNAL_NAME, subLabel: 'General' })
    return list
  }, [overview, extraRows, cells, entryNames, hidden, sortDir])

  // Options for the calendar log dialog: internal + every non-done project.
  const projectOptions: ProjectOptionRow[] = useMemo(() => [
    { projectKey: INTERNAL_KEY, projectName: INTERNAL_NAME, projectNumber: '' },
    ...(overview?.allProjects ?? []).map((p) => ({
      projectKey: p._id, projectName: p.projectName, projectNumber: p.projectNumber,
    })),
  ], [overview])

  const myProjectById = useMemo(() => {
    const m = new Map<string, MyProject>()
    for (const p of overview?.myProjects ?? []) m.set(p._id, p)
    return m
  }, [overview])

  // Which Subject this user's hours on a project belong to, from their role.
  const subjectForProject = useCallback((projectKey: string): string => {
    if (projectKey === INTERNAL_KEY) return 'EasyBIM Internal'
    const role = myProjectById.get(projectKey)?.roles[0]
    return role ? ROLE_SUBJECT[role] : 'Model MGMT'
  }, [myProjectById])

  // Write one category slot of a cell (optimistic; resyncs from the server on failure).
  const saveCategory = useCallback(async (
    row: GridRow, date: string, subject: string, subtopic: string, hours: number
  ) => {
    const key = cellKey(row.projectKey, date)
    setCells((m) => {
      const list = (m[key] ?? []).filter((e) => !(e.subject === subject && e.subtopic === subtopic))
      if (hours > 0) list.push({ subject, subtopic, hours })
      return { ...m, [key]: list }
    })
    setSaving((n) => n + 1)
    try {
      const res = await fetch('/api/me/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, projectKey: row.projectKey, projectName: row.projectName, subject, subtopic, hours }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await loadEntries()
    } finally {
      setSaving((n) => n - 1)
    }
  }, [loadEntries])

  const applyCellChanges = useCallback(async (
    row: GridRow, date: string, changes: Array<{ subject: string; subtopic: string; hours: number }>
  ) => {
    for (const c of changes) await saveCategory(row, date, c.subject, c.subtopic, c.hours)
    setCellEdit(null)
  }, [saveCategory])

  // Log a calendar event as hours — one entry per allocation, each in the
  // Subject/Subtopic the user chose in the dialog.
  const logEventHours = useCallback(async (event: CalendarEventDTO, allocations: Allocation[]) => {
    setSaving((n) => n + 1)
    try {
      for (const a of allocations) {
        const res = await fetch('/api/me/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: event.day,
            projectKey: a.projectKey,
            projectName: a.projectName,
            hours: a.hours,
            add: true,
            eventId: event.id,
            subject: a.subject,
            subtopic: a.subtopic,
          }),
        })
        const data = await res.json() as { ok?: boolean; hours?: number; error?: string }
        if (!data.ok) throw new Error(data.error ?? 'Save failed')
        const key = cellKey(a.projectKey, event.day)
        setCells((m) => {
          const list = (m[key] ?? []).filter((e) => !(e.subject === a.subject && e.subtopic === a.subtopic))
          const prev = (m[key] ?? []).find((e) => e.subject === a.subject && e.subtopic === a.subtopic)
          list.push({ subject: a.subject, subtopic: a.subtopic, hours: data.hours ?? (prev?.hours ?? 0) + a.hours })
          return { ...m, [key]: list }
        })
      }
      setLoggedEventIds((s) => new Set(s).add(event.id))
      setLogEvent(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving((n) => n - 1)
    }
  }, [])

  // "For all future meetings": store the manual correction as a rule, then
  // refresh the calendar so every same-title event turns recognized.
  const saveEventRule = useCallback(async (title: string, projects: Allocation[]) => {
    try {
      const res = await fetch('/api/me/event-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          projects: projects.map((p) => ({
            projectKey: p.projectKey,
            projectName: p.projectName,
            projectNumber: projectOptions.find((o) => o.projectKey === p.projectKey)?.projectNumber ?? '',
          })),
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Rule save failed')
      setCalReload((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [projectOptions])

  // Incremental Google consent: reauthorize the connected Google account with
  // the extra calendar scope and send the browser to Google's consent screen.
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

  // Totals come from ALL saved entries (not from visible rows), so hiding a
  // row never falsifies the day/week totals.
  const dayTotals = days.map((d) =>
    Object.entries(cells).reduce((s, [k, list]) => (k.endsWith(`|${d}`) ? s + cellTotal(list) : s), 0)
  )
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0)
  const expected = overview?.kpis.expectedWeeklyHours ?? 40

  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

  return (
    <div className="max-w-[1800px] w-full mx-auto flex-1 min-h-0 flex flex-col">
      {/* breadcrumb + title */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <Link href="/dashboard" className="hover:text-[#1e248c]">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/me" className="hover:text-[#1e248c]">My Space</Link>
        <ChevronRight size={12} />
        <span className="text-[#1e248c] font-medium">Submit hours</span>
      </div>
      <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
        <h1 className="text-2xl font-bold text-[#1e248c]">Submit working hours</h1>
        <div className="flex items-center gap-3">
          {saving > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
              <Loader2 size={12} className="animate-spin" /> saving…
            </span>
          )}
          <span className="text-[12px] font-semibold text-[#1e248c] tabular-nums">
            {entriesLoading ? '…' : `${weekTotal} / ${expected}h this week`}
          </span>
          <Link
            href="/me/analytics"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
          >
            <BarChart3 size={12} /> Analytics
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {/* week grid + calendar: equal-height halves filling the viewport,
          each scrolls internally */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 flex-1 min-h-0">
      <section id="time" className="glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2">
            <Clock3 size={14} /> This week · {weekLabel}
          </h2>
          <WeekNav
            onPrev={() => setWeekStart((w) => addDays(w, -7))}
            onToday={() => setWeekStart(weekStartOf(new Date()))}
            onNext={() => setWeekStart((w) => addDays(w, 7))}
          />
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr>
                <th
                  onClick={() => setSortDir((s) => (s === null ? 'asc' : s === 'asc' ? 'desc' : null))}
                  title="Sort by project number"
                  className="sticky top-0 z-10 text-left text-[10px] font-semibold text-gray-500 border border-[#e8eaff] bg-[#f0f3ff] px-2 py-1.5 cursor-pointer select-none hover:text-[#1e248c]"
                >
                  Project {sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : ''}
                </th>
                {days.map((d, i) => (
                  <th
                    key={d}
                    className={`sticky top-0 z-10 text-[10px] font-semibold border border-[#e8eaff] px-1 py-1.5 w-[52px] ${
                      d === today ? 'bg-[#e7eefe] text-[#1e248c]' : i >= 5 ? 'bg-gray-50 text-gray-400' : 'bg-[#f0f3ff] text-gray-500'
                    }`}
                  >
                    {DAY_LABELS[i]} {Number(d.slice(8))}
                  </th>
                ))}
                <th className="sticky top-0 z-10 text-[10px] font-semibold text-[#1e248c] border border-[#e8eaff] bg-[#e7eefe] px-1 py-1.5 w-[48px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowTotal = days.reduce((s, d) => s + cellTotal(cells[cellKey(row.projectKey, d)]), 0)
                return (
                  <tr key={row.projectKey} className="group">
                    <td className="border border-[#e8eaff] px-2 py-1 relative">
                      <div className="text-[11px] font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px] pr-4">
                        {row.projectNumber && (
                          <span className="font-mono text-[10px] text-[#44b8d3] mr-1">{row.projectNumber}</span>
                        )}
                        <bdi>{row.projectName}</bdi>
                      </div>
                      {row.subLabel && <div className="text-[9px] text-gray-400">{row.subLabel}</div>}
                      {row.projectKey !== INTERNAL_KEY && (
                        <button
                          onClick={() => persistHidden(new Set(hidden).add(row.projectKey))}
                          title="Remove row (saved hours are kept; re-add via 'Add project row')"
                          className="absolute top-1/2 -translate-y-1/2 right-1 w-5 h-5 rounded-full flex items-center justify-center
                            text-gray-400 opacity-40 group-hover:opacity-100 hover:text-white hover:bg-red-500 transition-all"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </td>
                    {days.map((d, i) => (
                      <CellButton
                        key={d}
                        entries={cells[cellKey(row.projectKey, d)]}
                        weekend={i >= 5}
                        isToday={d === today}
                        onOpen={() => setCellEdit({ row, date: d })}
                      />
                    ))}
                    <td className="border border-[#e8eaff] bg-[#e7eefe] text-center text-[11px] font-bold text-[#1e248c] tabular-nums">
                      {rowTotal || ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky bottom-0 z-10 border border-[#e8eaff] bg-[#f0f3ff] px-2 py-1.5 text-[11px] font-bold text-gray-700 shadow-[0_-1px_0_#e8eaff]">Day total</td>
                {dayTotals.map((t, i) => (
                  <td key={days[i]} className="sticky bottom-0 z-10 border border-[#e8eaff] bg-[#f0f3ff] text-center text-[11px] font-bold text-gray-700 tabular-nums shadow-[0_-1px_0_#e8eaff]">
                    {t || ''}
                  </td>
                ))}
                <td className={`sticky bottom-0 z-10 border border-[#e8eaff] bg-[#e7eefe] text-center text-[12px] font-bold tabular-nums shadow-[0_-1px_0_#e8eaff] ${weekTotal > expected ? 'text-amber-600' : 'text-[#1e248c]'}`}>
                  {weekTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* add project row */}
        <div className="mt-2 relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
          >
            <Plus size={12} /> Add project row
          </button>
          {pickerOpen && overview && (
            <div className="absolute z-20 bottom-full mb-1 w-72 max-h-64 overflow-y-auto bg-white rounded-xl border border-[#e8eaff] shadow-lg p-1">
              {overview.allProjects
                .filter((p) => !rows.some((r) => r.projectKey === p._id))
                .map((p) => (
                  <button
                    key={p._id}
                    onClick={() => {
                      // Adding also un-hides a previously removed row.
                      const next = new Set(hidden)
                      next.delete(p._id)
                      persistHidden(next)
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

      {/* calendar */}
      <section id="calendar" className="glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2">
            <CalendarDays size={14} /> My calendar · {weekLabel}
            <span className="text-[10px] font-normal text-gray-400">click an event to log it</span>
          </h2>
          <WeekNav
            onPrev={() => setWeekStart((w) => addDays(w, -7))}
            onToday={() => setWeekStart(weekStartOf(new Date()))}
            onNext={() => setWeekStart((w) => addDays(w, 7))}
          />
        </div>
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
      </div>

      {cellEdit && (
        <CellEditorModal
          row={cellEdit.row}
          date={cellEdit.date}
          entries={cells[cellKey(cellEdit.row.projectKey, cellEdit.date)] ?? []}
          onClose={() => setCellEdit(null)}
          onApply={(changes) => applyCellChanges(cellEdit.row, cellEdit.date, changes)}
        />
      )}

      {logEvent && (
        <LogEventModal
          event={logEvent}
          options={projectOptions}
          defaultSubjectFor={subjectForProject}
          onClose={() => setLogEvent(null)}
          onSave={logEventHours}
          onSaveRule={saveEventRule}
        />
      )}
    </div>
  )
}

/* ---------------- pieces ---------------- */

function WeekNav({ onPrev, onToday, onNext }: { onPrev: () => void; onToday: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <WeekNavButton onClick={onPrev} title="Previous week">
        <ChevronLeft size={13} />
      </WeekNavButton>
      <button
        onClick={onToday}
        className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
      >
        Today
      </button>
      <WeekNavButton onClick={onNext} title="Next week">
        <ChevronRight size={13} />
      </WeekNavButton>
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

// A grid cell: shows the day's total for the project, click to edit the
// Subject/Subtopic breakdown.
function CellButton({ entries, weekend, isToday, onOpen }: {
  entries: CellEntry[] | undefined
  weekend: boolean
  isToday: boolean
  onOpen: () => void
}) {
  const total = cellTotal(entries)
  const breakdown = (entries ?? [])
    .filter((e) => e.hours > 0)
    .map((e) => `${e.subject || 'Uncategorized'} · ${e.subtopic || '—'}: ${e.hours}h`)
    .join('\n')
  return (
    <td className={`border border-[#e8eaff] p-0 ${isToday ? 'bg-[#e7eefe]/60' : weekend ? 'bg-gray-50/60' : ''}`}>
      <button
        onClick={onOpen}
        title={breakdown || 'Click to log hours by category'}
        className={`w-full h-full px-1 py-1.5 text-center text-[11px] tabular-nums transition-colors hover:bg-white/80
          ${total ? 'text-gray-800 font-semibold' : 'text-gray-300'}`}
      >
        {total || '–'}
      </button>
    </td>
  )
}

// Cell editor: the four Subjects with their Subtopics, hours per slot.
function CellEditorModal({ row, date, entries, onClose, onApply }: {
  row: GridRow
  date: string
  entries: CellEntry[]
  onClose: () => void
  onApply: (changes: Array<{ subject: string; subtopic: string; hours: number }>) => void
}) {
  const slotKey = (s: string, t: string) => `${s}|${t}`
  // The internal row only takes EasyBIM Internal categories; project rows take the rest.
  const visibleTaxonomy = row.projectKey === INTERNAL_KEY
    ? TAXONOMY.filter((t) => t.subject === 'EasyBIM Internal')
    : TAXONOMY
  // Hours outside the visible categories (legacy entries, or a subject that no
  // longer applies to this row) — shown as their own editable rows below.
  const uncategorized = entries.filter(
    (e) => !visibleTaxonomy.some((s) => s.subject === e.subject && (s.subtopics as readonly string[]).includes(e.subtopic))
  )
  const existing = new Map(entries.map((e) => [slotKey(e.subject, e.subtopic), e.hours]))
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const e of entries) {
      if (e.hours) d[slotKey(e.subject, e.subtopic)] = String(e.hours)
    }
    return d
  })

  // Every slot that can hold hours in this dialog: the visible taxonomy plus
  // whatever uncategorized slots already exist.
  const allSlots: Array<{ subject: string; subtopic: string }> = [
    ...visibleTaxonomy.flatMap(({ subject, subtopics }) => subtopics.map((t) => ({ subject, subtopic: t }))),
    ...uncategorized.map((e) => ({ subject: e.subject, subtopic: e.subtopic })),
  ]

  const total = allSlots.reduce((s, slot) => {
    const n = Number(drafts[slotKey(slot.subject, slot.subtopic)])
    return s + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)

  const apply = () => {
    const changes: Array<{ subject: string; subtopic: string; hours: number }> = []
    for (const slot of allSlots) {
      const raw = drafts[slotKey(slot.subject, slot.subtopic)]
      const n = raw == null || raw.trim() === '' ? 0 : Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > 24) continue
      const hours = round25(n)
      const prev = existing.get(slotKey(slot.subject, slot.subtopic)) ?? 0
      if (hours !== prev) changes.push({ subject: slot.subject, subtopic: slot.subtopic, hours })
    }
    onApply(changes)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-[#e8eaff] w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-[#1e248c]">Log hours by category</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {row.projectNumber && <span className="font-mono text-[10px] text-[#44b8d3] mr-1">{row.projectNumber}</span>}
              <bdi>{row.projectName}</bdi> · {date}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>

        <div className="space-y-2.5 mb-3">
          {visibleTaxonomy.map(({ subject, subtopics }) => (
            <div key={subject}>
              <div className="text-[10px] font-bold text-[#1e248c] uppercase tracking-wide mb-1">{subject}</div>
              <div className="flex flex-wrap gap-2">
                {subtopics.map((t) => (
                  <label key={t} className="flex items-center gap-1.5 bg-[#f0f3ff] rounded-lg px-2 py-1">
                    <span className="text-[10px] text-gray-600">{t}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={drafts[slotKey(subject, t)] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [slotKey(subject, t)]: e.target.value }))}
                      className="w-11 text-[11px] text-center border border-[#e8eaff] rounded-md px-1 py-0.5 bg-white outline-none focus:ring-1 focus:ring-[#44b8d3] tabular-nums"
                    />
                    <span className="text-[9px] text-gray-400">h</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div className="border-t border-[#eef0fb] pt-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                Uncategorized (older entries) — edit here, or set to 0 and add above
              </div>
              <div className="flex flex-wrap gap-2">
                {uncategorized.map((e) => (
                  <label key={slotKey(e.subject, e.subtopic)} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    <span className="text-[10px] text-amber-800">
                      {e.subject || 'No subject'}{e.subtopic ? ` · ${e.subtopic}` : ''}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={drafts[slotKey(e.subject, e.subtopic)] ?? ''}
                      onChange={(ev) => setDrafts((d) => ({ ...d, [slotKey(e.subject, e.subtopic)]: ev.target.value }))}
                      className="w-11 text-[11px] text-center border border-amber-200 rounded-md px-1 py-0.5 bg-white outline-none focus:ring-1 focus:ring-[#44b8d3] tabular-nums"
                    />
                    <span className="text-[9px] text-gray-400">h</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[#1e248c] tabular-nums">Day total: {round25(total)}h</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold text-white bg-[#1e248c] hover:bg-[#333a9f] transition-colors"
            >
              <Check size={11} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
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

  /* ---- Google-Calendar-style time grid: hours down the Y axis, events
     positioned by start time and duration. ---- */
  const timedByDay = new Map<string, CalendarEventDTO[]>()
  const allDayByDay = new Map<string, CalendarEventDTO[]>()
  let minHour = 7
  let maxHour = 18
  for (const ev of calendar.events ?? []) {
    if (ev.allDay || !ev.startTime) {
      const l = allDayByDay.get(ev.day) ?? []
      l.push(ev)
      allDayByDay.set(ev.day, l)
      continue
    }
    const l = timedByDay.get(ev.day) ?? []
    l.push(ev)
    timedByDay.set(ev.day, l)
    const [h, m] = ev.startTime.split(':').map(Number)
    minHour = Math.min(minHour, h)
    maxHour = Math.max(maxHour, Math.ceil(h + m / 60 + Math.max(ev.durationHours, 0.5)))
  }
  minHour = Math.max(0, minHour)
  maxHour = Math.min(24, Math.max(maxHour, minHour + 6))
  // Zoom-to-fit: the day range maps to 100% of the card's remaining height,
  // so the whole day is always visible with no scrolling.
  const range = maxHour - minHour
  const startMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const hasAllDay = [...allDayByDay.values()].some((l) => l.length > 0)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col">
        {/* day headers */}
        <div className="flex shrink-0">
          <div className="w-11 shrink-0" />
          {days.map((d, i) => (
            <div
              key={d}
              className={`flex-1 text-center text-[10px] font-semibold py-1 rounded-t-md ${
                d === today ? 'text-[#1e248c] bg-[#e7eefe]/70' : 'text-gray-400'
              }`}
            >
              {DAY_LABELS[i]} {Number(d.slice(8))}
            </div>
          ))}
        </div>

        {/* all-day strip */}
        {hasAllDay && (
          <div className="flex shrink-0 border-b border-[#eef0fb] pb-1 mb-0.5">
            <div className="w-11 shrink-0 text-[8px] text-gray-300 pt-0.5 pr-1 text-right">all day</div>
            {days.map((d) => (
              <div key={d} className="flex-1 min-w-0 px-0.5 space-y-0.5">
                {(allDayByDay.get(d) ?? []).map((ev) => (
                  <div
                    key={ev.id}
                    title={ev.title}
                    className="rounded px-1 py-0.5 bg-gray-50 border border-gray-200 text-gray-400 text-[8px] leading-tight truncate"
                  >
                    {ev.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* time grid */}
        <div className="flex flex-1 min-h-0">
          {/* hour gutter */}
          <div className="w-11 shrink-0 relative">
            {Array.from({ length: range + 1 }, (_, i) => minHour + i).map((h) => (
              <span
                key={h}
                className="absolute right-1.5 text-[8px] text-gray-400 tabular-nums -translate-y-1/2"
                style={{ top: `${((h - minHour) / range) * 100}%` }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((d) => {
            const dayEvents = (timedByDay.get(d) ?? []).sort(
              (a, b) => startMinutes(a.startTime!) - startMinutes(b.startTime!)
            )
            return (
              <div
                key={d}
                className={`flex-1 relative border-l border-[#eef0fb] last:border-r ${d === today ? 'bg-[#e7eefe]/30' : ''}`}
              >
                {/* hour lines */}
                {Array.from({ length: range }, (_, i) => i + 1).map((i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-[#eef0fb] pointer-events-none"
                    style={{ top: `${(i / range) * 100}%` }}
                  />
                ))}
                {dayEvents.map((ev, idx) => {
                  const start = startMinutes(ev.startTime!)
                  const topPct = ((start - minHour * 60) / 60 / range) * 100
                  const heightPct = Math.min((ev.durationHours / range) * 100, 100 - topPct)
                  // Overlap handling: indent by how many earlier events are still running.
                  let lane = 0
                  for (let j = 0; j < idx; j++) {
                    const prev = dayEvents[j]
                    if (startMinutes(prev.startTime!) + prev.durationHours * 60 > start) lane++
                  }
                  const logged = loggedEventIds.has(ev.id)
                  const matches = ev.matches ?? []
                  const split = matches.length > 1
                    ? Math.max(round25(ev.durationHours / matches.length), 0.25)
                    : ev.durationHours
                  const hoverText = logged
                    ? 'Logged to the weekly card'
                    : matches.length > 0
                      ? `Recognized: ${matches.map((m) => `${m.projectNumber} ${m.projectName}`).join(' + ')} — ${split}h each as Meeting. Click to approve.`
                      : 'No project recognized — click to log manually'
                  const compact = ev.durationHours < 0.75
                  return (
                    <button
                      key={ev.id}
                      onClick={() => !logged && onPick(ev)}
                      disabled={logged}
                      title={`${ev.startTime} · ${ev.durationHours}h — ${hoverText}`}
                      className={`absolute text-left rounded-md border px-1 overflow-hidden leading-tight transition-colors ${
                        logged
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : matches.length > 0
                            ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer'
                            : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100 cursor-pointer'
                      }`}
                      style={{
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                        minHeight: 14,
                        left: `calc(${lane * 12}% + 2px)`,
                        right: 2,
                        zIndex: lane + 1,
                        paddingTop: compact ? 1 : 3,
                      }}
                    >
                      <span className={`flex items-center gap-0.5 text-[9px] font-semibold ${compact ? '' : 'mb-0.5'}`}>
                        {logged && <Check size={8} className="shrink-0" />}
                        <span className="truncate">{ev.title}</span>
                      </span>
                      {!compact && (
                        <span className="block text-[8px] opacity-70 tabular-nums">
                          {ev.startTime} · {ev.durationHours}h
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* legend */}
        <div className="flex flex-wrap items-center shrink-0 gap-x-4 gap-y-1 mt-3 pt-2 border-t border-[#eef0fb]">
          <LegendItem swatch="bg-amber-50 border-amber-300">
            Project recognized — hover to check, click to approve
          </LegendItem>
          <LegendItem swatch="bg-green-50 border-green-300">
            Approved &amp; logged to the weekly card
          </LegendItem>
          <LegendItem swatch="bg-red-50 border-red-200">
            Not recognized — click to log manually
          </LegendItem>
          <LegendItem swatch="bg-gray-50 border-gray-200">
            All-day — not loggable
          </LegendItem>
          <span className="text-[9px] text-gray-400 ms-auto">Showing only events you accepted</span>
        </div>
      </div>
    </div>
  )
}

function LegendItem({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] text-gray-500">
      <span className={`w-3 h-3 rounded border shrink-0 ${swatch}`} />
      {children}
    </span>
  )
}

interface AllocDraft {
  id: number
  projectKey: string
  subject: string
  subtopic: string
  hours: string
}

// Log dialog: any number of project allocations under one event, each with its
// own Subject/Subtopic and hours. Recognized projects pre-fill the rows.
function LogEventModal({ event, options, defaultSubjectFor, onClose, onSave, onSaveRule }: {
  event: CalendarEventDTO
  options: ProjectOptionRow[]
  defaultSubjectFor: (projectKey: string) => string
  onClose: () => void
  onSave: (event: CalendarEventDTO, allocations: Allocation[]) => Promise<void>
  onSaveRule: (title: string, projects: Allocation[]) => Promise<void>
}) {
  const matches = event.matches ?? []
  const defaultSplit = matches.length > 0
    ? Math.max(round25((event.durationHours || 1) / matches.length), 0.25)
    : event.durationHours || 1

  // Options can miss a recognized project (e.g. recently marked done) — keep it selectable.
  const allOptions: ProjectOptionRow[] = useMemo(() => {
    const map = new Map(options.map((o) => [o.projectKey, o]))
    for (const m of matches) {
      if (!map.has(m.projectId)) {
        map.set(m.projectId, { projectKey: m.projectId, projectName: m.projectName, projectNumber: m.projectNumber })
      }
    }
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, event.id])

  const [drafts, setDrafts] = useState<AllocDraft[]>(() =>
    matches.length > 0
      ? matches.map((m, i) => ({
          id: i,
          projectKey: m.projectId,
          subject: defaultSubjectFor(m.projectId),
          subtopic: 'Meetings',
          hours: String(defaultSplit),
        }))
      : [{
          id: 0,
          projectKey: options[1]?.projectKey ?? INTERNAL_KEY,
          subject: defaultSubjectFor(options[1]?.projectKey ?? INTERNAL_KEY),
          subtopic: 'Meetings',
          hours: String(event.durationHours || 1),
        }]
  )
  const nextId = useRef(drafts.length)
  const [busy, setBusy] = useState(false)
  // Slider range: half-hour steps up to a full workday (or the event length if longer).
  const sliderMax = Math.max(8, Math.ceil(event.durationHours))

  const subtopicsFor = (subject: string): readonly string[] =>
    TAXONOMY.find((t) => t.subject === subject)?.subtopics ?? ['Meetings']

  // Internal work only takes the EasyBIM Internal subject; projects take the rest.
  const subjectChoicesFor = (projectKey: string) =>
    projectKey === INTERNAL_KEY
      ? TAXONOMY.filter((t) => t.subject === 'EasyBIM Internal')
      : TAXONOMY.filter((t) => t.subject !== 'EasyBIM Internal')

  const updateDraft = (id: number, patch: Partial<AllocDraft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  const changeProject = (id: number, projectKey: string) => {
    const subject = defaultSubjectFor(projectKey)
    const subtopic = subtopicsFor(subject).includes('Meetings') ? 'Meetings' : subtopicsFor(subject)[0]
    updateDraft(id, { projectKey, subject, subtopic })
  }

  const addDraft = () => {
    setDrafts((ds) => [...ds, {
      id: nextId.current++,
      projectKey: INTERNAL_KEY,
      subject: 'EasyBIM Internal',
      subtopic: 'Meetings',
      hours: '0.5',
    }])
  }

  const buildAllocations = (): Allocation[] =>
    drafts
      .map((d) => {
        const n = round25(Number(d.hours))
        const opt = allOptions.find((o) => o.projectKey === d.projectKey)
        return {
          projectKey: d.projectKey,
          projectName: opt?.projectName ?? '',
          hours: n,
          subject: d.subject,
          subtopic: d.subtopic,
        }
      })
      .filter((a) => Number.isFinite(a.hours) && a.hours > 0 && a.hours <= 24)

  const run = async (alsoRule: boolean) => {
    const allocations = buildAllocations()
    if (allocations.length === 0) return
    setBusy(true)
    try {
      await onSave(event, allocations)
      if (alsoRule) await onSaveRule(event.title, allocations)
    } finally {
      setBusy(false)
    }
  }

  const total = round25(drafts.reduce((s, d) => {
    const n = Number(d.hours)
    return s + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0))

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-[#e8eaff] w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-[#1e248c]">Log as working hours</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {event.title} · {event.day} {event.startTime ? `· ${event.startTime}` : ''} · {event.durationHours}h
            </p>
            {matches.length > 0 && (
              <p className="text-[10px] text-amber-700 mt-0.5">
                {matches.length} project{matches.length > 1 ? 's' : ''} recognized from the title — adjust anything before logging.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>

        <div className="space-y-2 mb-3">
          {drafts.map((d) => (
            <div key={d.id} className="border border-[#e8eaff] rounded-xl p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <ProjectSearchSelect
                  options={allOptions}
                  value={d.projectKey}
                  onChange={(k) => changeProject(d.id, k)}
                />
                {drafts.length > 1 && (
                  <button
                    onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
                    title="Remove"
                    className="text-gray-300 hover:text-red-500 shrink-0"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.5}
                  max={sliderMax}
                  step={0.5}
                  value={Math.min(Math.max(Number(d.hours) || 0.5, 0.5), sliderMax)}
                  onChange={(e) => updateDraft(d.id, { hours: e.target.value })}
                  className="flex-1 accent-[#1e248c] h-1.5"
                />
                <span className="text-[11px] font-bold text-[#1e248c] tabular-nums w-9 text-right shrink-0">
                  {Number(d.hours) || 0.5}h
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={d.subject}
                  onChange={(e) => {
                    const subject = e.target.value
                    const subs = subtopicsFor(subject)
                    updateDraft(d.id, { subject, subtopic: subs.includes(d.subtopic) ? d.subtopic : subs[0] })
                  }}
                  className="flex-1 text-[10px] border border-[#e8eaff] rounded-lg px-1.5 py-1 bg-[#f0f3ff] outline-none focus:ring-1 focus:ring-[#44b8d3]"
                >
                  {subjectChoicesFor(d.projectKey).map((t) => <option key={t.subject} value={t.subject}>{t.subject}</option>)}
                </select>
                <select
                  value={d.subtopic}
                  onChange={(e) => updateDraft(d.id, { subtopic: e.target.value })}
                  className="flex-1 text-[10px] border border-[#e8eaff] rounded-lg px-1.5 py-1 bg-[#f0f3ff] outline-none focus:ring-1 focus:ring-[#44b8d3]"
                >
                  {subtopicsFor(d.subject).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addDraft}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium bg-white border border-[#e8eaff] text-[#1e248c] hover:bg-blue-50 transition-colors mb-3"
        >
          <Plus size={11} /> Add another project
        </button>

        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-bold text-[#1e248c] tabular-nums">Total: {total}h</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => run(false)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold text-white bg-[#1e248c] hover:bg-[#333a9f] transition-colors disabled:opacity-60"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Log hours
            </button>
          </div>
        </div>

        {/* Recurring meeting? One click logs now AND remembers the project mapping. */}
        <button
          onClick={() => run(true)}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold text-[#1e248c] bg-[#e7eefe] border border-[#c5caff] hover:bg-[#dbe4fd] transition-colors disabled:opacity-60"
        >
          <Repeat size={11} /> Log &amp; apply to all future &quot;{event.title.length > 24 ? event.title.slice(0, 24) + '…' : event.title}&quot; meetings
        </button>
      </div>
    </div>
  )
}

// Combobox for picking a project: type to filter by name or number.
function ProjectSearchSelect({ options, value, onChange }: {
  options: ProjectOptionRow[]
  value: string
  onChange: (projectKey: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find((o) => o.projectKey === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter((o) => o.projectName.toLowerCase().includes(q) || o.projectNumber.includes(q))
    : options

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery('') }}
        className="w-full text-left text-[11px] border border-[#e8eaff] rounded-lg px-1.5 py-1 bg-white outline-none focus:ring-1 focus:ring-[#44b8d3] whitespace-nowrap overflow-hidden text-ellipsis"
      >
        {selected ? (
          <>
            {selected.projectNumber && <span className="font-mono text-[10px] text-[#44b8d3] mr-1">{selected.projectNumber}</span>}
            <bdi>{selected.projectName}</bdi>
          </>
        ) : 'Choose project…'}
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white rounded-xl border border-[#e8eaff] shadow-lg p-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or number…"
            className="w-full text-[11px] border border-[#e8eaff] rounded-lg px-2 py-1 mb-1 outline-none focus:ring-1 focus:ring-[#44b8d3]"
          />
          <div className="max-h-40 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.projectKey}
                type="button"
                onClick={() => { onChange(o.projectKey); setOpen(false) }}
                className={`w-full text-left px-2 py-1 rounded-lg text-[11px] hover:bg-blue-50 ${o.projectKey === value ? 'bg-[#e7eefe] text-[#1e248c] font-semibold' : 'text-gray-700'}`}
              >
                {o.projectNumber && <span className="font-mono text-[10px] text-[#44b8d3] mr-1.5">{o.projectNumber}</span>}
                <bdi>{o.projectName}</bdi>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-1.5 text-[10px] text-gray-400">No project matches &quot;{query}&quot;</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
