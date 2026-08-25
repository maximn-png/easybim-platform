'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, CalendarCheck2, ChevronRight, Clock3, Cloud, ExternalLink, FolderKanban, FolderOpen, LayoutGrid, ListTodo, RefreshCw,
} from 'lucide-react'
import type { AgendaMilestone, AgendaTask, MeAgenda, MeOverview, TimeEntryDTO } from '@/lib/meTypes'
import type { ProjectRow } from '@/lib/types'
import ProgressBar from './ProgressBar'
import TeamMemberCell from './TeamMemberCell'
import ColumnHeaderMenu, { type FilterValue, type SortDir } from './ColumnHeaderMenu'

/* My Space hub: one viewport-locked page.
   Left → right: My tasks (all boards, overdue + this month), My milestones
   (MI-001, this month, RTL), My projects (EPM-style table, RTL). */

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000'

function toYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const fmtDay = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// Monday's own label colors, so chips here look exactly like the board.
const MONDAY_STATUS_COLORS: Record<string, string> = {
  'submitted': '#00c875',
  'done': '#00c875',
  'work completed': '#9d50dd',
  'working on it': '#fdab3d',
  'future steps': '#216edf',
  'rejected': '#df2f4a',
  'stuck': '#df2f4a',
  '?': '#faa1f1',
}
const statusColor = (s: string | null) => MONDAY_STATUS_COLORS[(s ?? '').trim().toLowerCase()] ?? '#c4c4c4'

// Monday profile photos of a bill's employees (stacked, max 3).
function BillAvatars({ employees, size = 16 }: { employees: Array<{ id: string; name: string; avatarUrl?: string }>; size?: number }) {
  if (!employees.length) return null
  return (
    <span className="inline-flex shrink-0 -space-x-1 rtl:space-x-reverse align-middle">
      {employees.slice(0, 3).map((e) =>
        e.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={e.id} src={e.avatarUrl} alt={e.name} title={e.name}
            className="rounded-full object-cover border border-white" style={{ width: size, height: size }} />
        ) : (
          <span key={e.id} title={e.name}
            className="rounded-full bg-[#e8eaff] text-[#1e248c] text-[7px] font-bold flex items-center justify-center border border-white"
            style={{ width: size, height: size }}>
            {(e.name || '?').slice(0, 1)}
          </span>
        )
      )}
    </span>
  )
}

function StatusChip({ status, small }: { status: string | null; small?: boolean }) {
  return (
    <span
      className={`shrink-0 font-semibold rounded text-white text-center ${small ? 'text-[8px] px-1 py-px min-w-[52px]' : 'text-[9px] px-1.5 py-0.5 min-w-[64px]'}`}
      style={{ background: statusColor(status) }}
    >
      {status || '—'}
    </span>
  )
}

export default function MySpaceClient({ userName }: { userName: string }) {
  const [overview, setOverview] = useState<MeOverview | null>(null)
  const [allRows, setAllRows] = useState<ProjectRow[] | null>(null)
  const [agenda, setAgenda] = useState<MeAgenda | null>(null)
  const [weekHours, setWeekHours] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The tasks sweep may still be building server-side — poll until it lands.
  const loadAgenda = useCallback(async () => {
    try {
      const res = await fetch('/api/me/agenda')
      const data = await res.json() as { agenda?: MeAgenda; error?: string }
      if (data.error) { setError(data.error); return }
      const a = data.agenda ?? { milestones: [], milestoneHistory: {}, tasks: [], tasksBuilding: false, tasksCachedAt: null, mondayIdFound: false }
      setAgenda(a)
      if (a.tasksBuilding) {
        pollTimer.current = setTimeout(loadAgenda, 45_000)
      }
    } catch {
      setAgenda({ milestones: [], milestoneHistory: {}, tasks: [], tasksBuilding: false, tasksCachedAt: null, mondayIdFound: false })
    }
  }, [])

  useEffect(() => {
    fetch('/api/me/overview')
      .then((r) => r.json() as Promise<{ overview?: MeOverview; error?: string }>)
      .then((data) => {
        if (data.error) setError(data.error)
        else setOverview(data.overview ?? null)
      })
      .catch((e) => setError(String(e)))

    fetch('/api/projects')
      .then((r) => r.json() as Promise<{ projects?: ProjectRow[] }>)
      .then((data) => setAllRows(data.projects ?? []))
      .catch(() => setAllRows([]))

    loadAgenda()

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    const end = new Date(start); end.setDate(end.getDate() + 6)
    fetch(`/api/me/time-entries?start=${toYMD(start)}&end=${toYMD(end)}`)
      .then((r) => r.json() as Promise<{ entries?: TimeEntryDTO[] }>)
      .then((data) => setWeekHours((data.entries ?? []).reduce((s, e) => s + e.hours, 0)))
      .catch(() => {})

    return () => { if (pollTimer.current) clearTimeout(pollTimer.current) }
  }, [loadAgenda])

  // The user's projects as full EPM dashboard rows.
  const myRows = useMemo(() => {
    if (!allRows || !overview) return null
    const mine = new Set(overview.myProjects.filter((p) => p.status.toLowerCase() !== 'done').map((p) => p._id))
    return allRows.filter((r) => mine.has(r._id))
  }, [allRows, overview])

  const expected = overview?.kpis.expectedWeeklyHours ?? 40
  const firstName = userName.split(' ')[0] || 'there'
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long' })
  const overdueCount = agenda?.tasks.filter((t) => t.overdue).length ?? 0

  // Manual tasks refresh: kick a background re-sweep, then poll until the
  // cache timestamp moves.
  const [tasksRefreshing, setTasksRefreshing] = useState(false)
  const refreshTasks = useCallback(async () => {
    if (!agenda || tasksRefreshing) return
    setTasksRefreshing(true)
    const baseline = agenda.tasksCachedAt
    try { await fetch('/api/me/agenda?refresh=1') } catch { /* poll anyway */ }
    let tries = 0
    const poll = async () => {
      tries++
      try {
        const res = await fetch('/api/me/agenda')
        const data = await res.json() as { agenda?: MeAgenda }
        if (data.agenda && data.agenda.tasksCachedAt !== baseline) {
          setAgenda(data.agenda)
          setTasksRefreshing(false)
          return
        }
      } catch { /* keep polling */ }
      if (tries < 20) setTimeout(poll, 15_000)
      else setTasksRefreshing(false)
    }
    setTimeout(poll, 15_000)
  }, [agenda, tasksRefreshing])

  // Column write-back (priority / status / due date): optimistic locally,
  // then the Monday mutation; revert on failure. Done-like statuses drop the
  // row, matching the sweep's own filter.
  const DONE_LIKE = useMemo(() => new Set([
    'done', 'submitted', 'completed', 'work completed', 'closed', 'rejected', 'canceled', 'cancelled',
    'הושלם', 'בוצע', 'סגור', 'אושר', 'הוגש',
  ]), [])
  const updateTask = useCallback(async (task: AgendaTask, columnId: string | null, value: string, patch: Partial<AgendaTask>) => {
    if (!columnId || !value) return
    setAgenda((a) => a ? { ...a, tasks: a.tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)) } : a)
    try {
      const res = await fetch('/api/me/task-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: task.boardId, itemId: task.id, columnId, value }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Update failed')
      if (patch.status && DONE_LIKE.has(patch.status.trim().toLowerCase())) {
        setAgenda((a) => a ? { ...a, tasks: a.tasks.filter((t) => t.id !== task.id) } : a)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setAgenda((a) => a ? { ...a, tasks: a.tasks.map((t) => (t.id === task.id ? task : t)) } : a)
    }
  }, [DONE_LIKE])

  const cachedAgo = agenda?.tasksCachedAt
    ? Math.max(0, Math.round((Date.now() - new Date(agenda.tasksCachedAt).getTime()) / 60_000))
    : null

  /* ---- milestones table: sort + filters ---- */
  type MCol = 'project' | 'milestone' | 'bill' | 'date' | 'status'
  const mValue: Record<MCol, (m: AgendaMilestone) => string> = {
    project: (m) => m.project,
    milestone: (m) => m.milestoneName,
    bill: (m) => m.billName,
    date: (m) => m.date,
    status: (m) => m.status || '(none)',
  }
  const [mSort, setMSort] = useState<{ key: MCol; dir: SortDir } | null>(null)
  const [mFilters, setMFilters] = useState<Partial<Record<MCol, Set<string> | null>>>({})
  const mValues = useMemo(() => {
    const out = {} as Record<MCol, FilterValue[]>
    for (const key of Object.keys(mValue) as MCol[]) {
      const counts = new Map<string, number>()
      for (const m of agenda?.milestones ?? []) counts.set(mValue[key](m), (counts.get(mValue[key](m)) ?? 0) + 1)
      out[key] = [...counts.entries()].map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda])
  const mShown = useMemo(() => {
    let list = (agenda?.milestones ?? []).filter((m) =>
      (Object.keys(mValue) as MCol[]).every((key) => {
        const sel = mFilters[key]
        return !sel || sel.has(mValue[key](m))
      })
    )
    const active = mSort ?? { key: 'date' as MCol, dir: 'asc' as SortDir }
    const dir = active.dir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => mValue[active.key](a).localeCompare(mValue[active.key](b), undefined, { numeric: true }) * dir)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, mSort, mFilters])

  /* ---- tasks table: sort + filters ---- */
  type TCol = 'task' | 'board' | 'date' | 'priority' | 'status'
  const tValue: Record<TCol, (t: AgendaTask) => string> = {
    task: (t) => t.name,
    board: (t) => t.boardName,
    date: (t) => t.date,
    priority: (t) => t.priority ?? '(none)',
    status: (t) => t.status ?? '(none)',
  }
  const [tSort, setTSort] = useState<{ key: TCol; dir: SortDir } | null>(null)
  const [tFilters, setTFilters] = useState<Partial<Record<TCol, Set<string> | null>>>({})
  const tValues = useMemo(() => {
    const out = {} as Record<TCol, FilterValue[]>
    for (const key of Object.keys(tValue) as TCol[]) {
      const counts = new Map<string, number>()
      for (const t of agenda?.tasks ?? []) counts.set(tValue[key](t), (counts.get(tValue[key](t)) ?? 0) + 1)
      out[key] = [...counts.entries()].map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda])
  const tShown = useMemo(() => {
    let list = (agenda?.tasks ?? []).filter((t) =>
      (Object.keys(tValue) as TCol[]).every((key) => {
        const sel = tFilters[key]
        return !sel || sel.has(tValue[key](t))
      })
    )
    const active = tSort ?? { key: 'date' as TCol, dir: 'asc' as SortDir }
    const dir = active.dir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => tValue[active.key](a).localeCompare(tValue[active.key](b), undefined, { numeric: true }) * dir)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, tSort, tFilters])

  return (
    <div className="max-w-[1800px] w-full mx-auto flex-1 min-h-0 flex flex-col">
      {/* breadcrumb — back to the platform portal */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <a href={PORTAL_URL} className="hover:text-[#1e248c]">Platform</a>
        <ChevronRight size={12} />
        <span className="text-[#1e248c] font-medium">My Space</span>
      </div>

      {/* greeting + quick links */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h1 className="text-2xl font-bold text-[#1e248c]">Good morning, {firstName}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/me/hours"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold text-white bg-[#1e248c] hover:bg-[#333a9f] transition-colors"
          >
            <Clock3 size={13} />
            Submit working hours
            <span className="text-[11px] font-bold tabular-nums bg-white/20 rounded-full px-2 py-0.5">
              {weekHours != null ? `${weekHours}/${expected}h` : '…'}
            </span>
          </Link>
          <a
            href="https://knowledge.easybim.co.il"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
          >
            <BookOpen size={12} /> Knowledge Center <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {/* tasks | milestones | projects */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* My tasks — all boards, overdue + this month */}
        <section className="lg:col-span-3 glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-1 shrink-0">
            <ListTodo size={14} /> My tasks
            {agenda && overdueCount > 0 && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600">
                {overdueCount} overdue
              </span>
            )}
            {agenda && !agenda.tasksBuilding && (
              <span className="text-[10px] font-normal text-gray-400 tabular-nums ms-auto">{agenda.tasks.length}</span>
            )}
          </h2>
          {agenda && !agenda.tasksBuilding && (
            <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
              <button
                onClick={refreshTasks}
                disabled={tasksRefreshing}
                title="Re-scan your Monday boards now"
                className="inline-flex items-center gap-1 text-[9px] font-medium text-gray-400 hover:text-[#1e248c] disabled:opacity-60"
              >
                <RefreshCw size={10} className={tasksRefreshing ? 'animate-spin' : ''} />
                {tasksRefreshing ? 'refreshing — takes a few minutes…' : cachedAgo != null ? `updated ${cachedAgo}m ago · refresh` : 'refresh'}
              </button>
            </div>
          )}
          <div dir="rtl" className="flex-1 min-h-0 overflow-auto">
            {!agenda ? <Skeleton /> : agenda.tasksBuilding ? (
              <div dir="ltr"><Skeleton note="First scan of all your Monday boards is running in the background — this card fills itself in a few minutes." /></div>
            ) : !agenda.mondayIdFound ? (
              <div dir="ltr"><Empty>Couldn&apos;t find your Monday identity on any project team, so assigned items can&apos;t be matched to you.</Empty></div>
            ) : agenda.tasks.length === 0 ? (
              <div dir="ltr"><Empty>No open items assigned to you are overdue or due this month. 🎉</Empty></div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <MenuTh label="Task" start align="right"
                      sortDir={tSort?.key === 'task' ? tSort.dir : null}
                      onSort={(d) => setTSort(d ? { key: 'task', dir: d } : null)}
                      values={tValues.board} selected={tFilters.board ?? null}
                      onFilter={(n) => setTFilters((f) => ({ ...f, board: n }))} />
                    <MenuTh label="Due"
                      sortDir={tSort?.key === 'date' ? tSort.dir : null}
                      onSort={(d) => setTSort(d ? { key: 'date', dir: d } : null)}
                      values={tValues.date} selected={tFilters.date ?? null}
                      onFilter={(n) => setTFilters((f) => ({ ...f, date: n }))} />
                    <MenuTh label="Priority"
                      sortDir={tSort?.key === 'priority' ? tSort.dir : null}
                      onSort={(d) => setTSort(d ? { key: 'priority', dir: d } : null)}
                      values={tValues.priority} selected={tFilters.priority ?? null}
                      onFilter={(n) => setTFilters((f) => ({ ...f, priority: n }))} />
                    <MenuTh label="Status" align="left"
                      sortDir={tSort?.key === 'status' ? tSort.dir : null}
                      onSort={(d) => setTSort(d ? { key: 'status', dir: d } : null)}
                      values={tValues.status} selected={tFilters.status ?? null}
                      onFilter={(n) => setTFilters((f) => ({ ...f, status: n }))} />
                  </tr>
                </thead>
                <tbody>
                  {tShown.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => window.open(t.url, '_blank', 'noopener')}
                      className="hover:bg-white/60 cursor-pointer"
                      title="Open in Monday"
                    >
                      {/* task + board share a cell so the table never scrolls sideways */}
                      <td className="border-b border-[#eef0fb] px-1.5 py-1 text-start min-w-0">
                        <span className="text-[11px] font-semibold text-gray-800 block overflow-hidden text-ellipsis whitespace-nowrap">{t.name}</span>
                        <span className="text-[9px] text-gray-400 block overflow-hidden text-ellipsis whitespace-nowrap">{t.boardName}</span>
                      </td>
                      <td className="border-b border-[#eef0fb] px-1 py-1 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()} dir="ltr">
                        {t.dueColumnId ? (
                          <input
                            type="date"
                            value={t.date}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v) updateTask(t, t.dueColumnId, v, { date: v, overdue: v < toYMD(new Date()) })
                            }}
                            title="Due date — saves back to Monday"
                            className={`text-[9px] tabular-nums border border-transparent hover:border-[#e8eaff] focus:border-[#c5caff] rounded px-0.5 py-0.5 bg-transparent outline-none w-[92px] ${t.overdue ? 'text-red-500 font-bold' : 'text-[#1e248c] font-bold'}`}
                          />
                        ) : (
                          <span className={`text-[10px] font-bold tabular-nums ${t.overdue ? 'text-red-500' : 'text-[#1e248c]'}`}>{fmtDay(t.date)}</span>
                        )}
                      </td>
                      <td className="border-b border-[#eef0fb] px-0.5 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        {t.priorityColumnId && t.priorityLabels.length > 0 ? (
                          <select
                            value={t.priority ?? ''}
                            onChange={(e) => updateTask(t, t.priorityColumnId, e.target.value, { priority: e.target.value })}
                            title="Priority — saves back to Monday"
                            className="text-[9px] text-gray-600 border border-[#e8eaff] rounded px-0.5 py-0.5 bg-white outline-none w-[64px]"
                          >
                            {!t.priority && <option value="">—</option>}
                            {t.priorityLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        ) : (
                          <span className="text-[9px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="border-b border-[#eef0fb] px-0.5 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        {t.statusColumnId && t.statusLabels.length > 0 ? (
                          <select
                            value={t.status ?? ''}
                            onChange={(e) => updateTask(t, t.statusColumnId, e.target.value, { status: e.target.value })}
                            title="Status — saves back to Monday"
                            className="text-[9px] font-semibold text-white border-0 rounded px-0.5 py-1 outline-none w-[86px] text-center"
                            style={{ background: statusColor(t.status) }}
                          >
                            {!t.status && <option value="">—</option>}
                            {t.statusLabels.map((l) => <option key={l} value={l} style={{ background: '#fff', color: '#374151' }}>{l}</option>)}
                          </select>
                        ) : (
                          <StatusChip status={t.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* My milestones — RTL */}
        <section className="lg:col-span-4 glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-2 shrink-0">
            <CalendarCheck2 size={14} /> My milestones
            <span className="text-[10px] font-normal text-gray-400">{monthLabel}</span>
            {agenda && <span className="text-[10px] font-normal text-gray-400 tabular-nums ms-auto">{agenda.milestones.length}</span>}
          </h2>
          <div dir="rtl" className="flex-1 min-h-0 overflow-auto">
            {!agenda ? <Skeleton /> : agenda.milestones.length === 0 ? (
              <Empty>No milestone bills due on your projects this month. 🎉</Empty>
            ) : (
              <table className="w-full border-collapse min-w-[520px]">
                <thead>
                  <tr>
                    <MenuTh label="Project" start align="right"
                      sortDir={mSort?.key === 'project' ? mSort.dir : null}
                      onSort={(d) => setMSort(d ? { key: 'project', dir: d } : null)}
                      values={mValues.project} selected={mFilters.project ?? null}
                      onFilter={(n) => setMFilters((f) => ({ ...f, project: n }))} />
                    <MenuTh label="Milestone"
                      sortDir={mSort?.key === 'milestone' ? mSort.dir : null}
                      onSort={(d) => setMSort(d ? { key: 'milestone', dir: d } : null)}
                      values={mValues.milestone} selected={mFilters.milestone ?? null}
                      onFilter={(n) => setMFilters((f) => ({ ...f, milestone: n }))} />
                    <MenuTh label="Bill"
                      sortDir={mSort?.key === 'bill' ? mSort.dir : null}
                      onSort={(d) => setMSort(d ? { key: 'bill', dir: d } : null)}
                      values={mValues.bill} selected={mFilters.bill ?? null}
                      onFilter={(n) => setMFilters((f) => ({ ...f, bill: n }))} />
                    <MenuTh label="Date"
                      sortDir={mSort?.key === 'date' ? mSort.dir : null}
                      onSort={(d) => setMSort(d ? { key: 'date', dir: d } : null)}
                      values={mValues.date} selected={mFilters.date ?? null}
                      onFilter={(n) => setMFilters((f) => ({ ...f, date: n }))} />
                    <MenuTh label="Status" align="left"
                      sortDir={mSort?.key === 'status' ? mSort.dir : null}
                      onSort={(d) => setMSort(d ? { key: 'status', dir: d } : null)}
                      values={mValues.status} selected={mFilters.status ?? null}
                      onFilter={(n) => setMFilters((f) => ({ ...f, status: n }))} />
                  </tr>
                </thead>
                {mShown.map((m, i) => (
                  <tbody key={i} className="group">
                    {/* the row opens the BILL subitem (its updates) */}
                    <tr
                      onClick={() => m.url && window.open(m.url, '_blank', 'noopener')}
                      className="hover:bg-white/60 cursor-pointer"
                      title="Open the bill in Monday"
                    >
                      <td className="border-b border-[#eef0fb] px-1.5 py-1 text-start">
                        <span className="text-[11px] font-bold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis block max-w-[140px]">{m.projectName}</span>
                        <span className="font-mono text-[9px] text-[#44b8d3]" dir="ltr">{m.projectNumber}</span>
                      </td>
                      <td className="border-b border-[#eef0fb] px-1.5 py-1 text-start">
                        <span className="text-[10px] text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis block max-w-[160px]">{m.milestoneName}</span>
                      </td>
                      <td className="border-b border-[#eef0fb] px-1.5 py-1 text-start">
                        <span className="inline-flex items-center gap-1.5">
                          <BillAvatars employees={m.employees} />
                          <span className="text-[10px] text-gray-600 whitespace-nowrap">{m.billName}</span>
                        </span>
                      </td>
                      <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center text-[10px] font-bold text-[#1e248c] tabular-nums whitespace-nowrap" dir="ltr">
                        {fmtDay(m.date)}
                      </td>
                      <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center">
                        <StatusChip status={m.status} />
                      </td>
                    </tr>
                    {/* hover: every milestone of this project, bills nested beneath */}
                    <tr className="hidden group-hover:table-row">
                      <td colSpan={5} className="border-b border-[#e8eaff] bg-white px-3 py-2">
                        <div className="text-[10px] font-bold text-[#1e248c] border-b border-[#eef0fb] pb-1 mb-1">
                          כל אבני הדרך · {m.projectName} <span className="font-mono text-[9px] text-[#44b8d3]" dir="ltr">{m.projectNumber}</span>
                        </div>
                        {(() => {
                          const history = agenda.milestoneHistory[m.projectItemId] ?? []
                          const groups = new Map<string, typeof history>()
                          for (const h of history) {
                            const list = groups.get(h.milestoneName) ?? []
                            list.push(h)
                            groups.set(h.milestoneName, list)
                          }
                          return [...groups.entries()].map(([name, bills], gi) => (
                            <div key={gi} className="mb-1 last:mb-0">
                              <div className="text-[10px] font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">{name}</div>
                              {bills.map((h, j) => (
                                <div key={j} className="flex items-center gap-2 py-0.5 ms-3">
                                  <span className="w-1 h-1 rounded-full bg-[#c5caff] shrink-0" />
                                  <BillAvatars employees={h.employees} size={14} />
                                  <span className="flex-1 min-w-0 text-[10px] text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">{h.billName}</span>
                                  <span dir="ltr" className="shrink-0 text-[9px] text-gray-400 tabular-nums">{fmtDay(h.date)}</span>
                                  <StatusChip status={h.status} small />
                                </div>
                              ))}
                            </div>
                          ))
                        })()}
                      </td>
                    </tr>
                  </tbody>
                ))}
              </table>
            )}
          </div>
        </section>

        {/* My projects — EPM-style table, RTL */}
        <section className="lg:col-span-5 glass-card rounded-2xl p-3 flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2 mb-2 shrink-0 px-1">
            <FolderKanban size={14} /> My projects
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              Working on it
            </span>
            {myRows && <span className="text-[10px] font-normal text-gray-400 tabular-nums ms-auto">{myRows.length}</span>}
          </h2>
          <div dir="rtl" className="flex-1 min-h-0 overflow-auto" style={{ zoom: 0.85 }}>
            {!myRows ? (
              <div dir="ltr"><Skeleton /></div>
            ) : myRows.length === 0 ? (
              <div dir="ltr"><Empty>No projects matched to you — you are matched by the team columns synced from Monday.</Empty></div>
            ) : (
              <MyProjectsTable rows={myRows} />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/* EPM-dashboard-style table, trimmed to My Space: columns run right→left as
   Project, #, ACC, Drive, Monday, team, hours, milestones (status column
   dropped — everything here is "Working on it"). Sorted by project number by
   default; every column gets the Excel-style sort/filter menu. */
type PCol = 'name' | 'num' | 'acc' | 'drive' | 'monday' | 'bim' | 'mep' | 'mod' | 'hours' | 'mile'

const mondayHrefOf = (p: ProjectRow) => p.links.dedicatedBoard || p.links.mainBoard || p.links.mondayBoard

// Display value per column — used for both filtering and text sorting.
const pColValue: Record<PCol, (p: ProjectRow) => string> = {
  name:   (p) => p.projectName,
  num:    (p) => p.projectNumber || '(none)',
  acc:    (p) => (p.links.acc ? 'Linked' : '(none)'),
  drive:  (p) => (p.links.driveFolder ? 'Linked' : '(none)'),
  monday: (p) => (mondayHrefOf(p) ? 'Linked' : '(none)'),
  bim:    (p) => p.bimManager?.name ?? '(none)',
  mep:    (p) => p.mepCoordinator?.name ?? '(none)',
  mod:    (p) => p.bimModeller?.name ?? '(none)',
  hours:  (p) => (p.hoursProgress != null ? `${p.hoursProgress}%` : '(none)'),
  mile:   (p) => (p.milestoneProgress != null ? `${p.milestoneProgress}%` : '(none)'),
}
const pColNumeric = new Set<PCol>(['num', 'hours', 'mile'])
const pSortValue = (key: PCol, p: ProjectRow): string | number => {
  if (key === 'num') return parseInt((p.projectNumber ?? '').replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER
  if (key === 'hours') return p.hoursProgress ?? -1
  if (key === 'mile') return p.milestoneProgress ?? -1
  return pColValue[key](p)
}

function MyProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const [sort, setSort] = useState<{ key: PCol; dir: SortDir } | null>(null)
  const [filters, setFilters] = useState<Partial<Record<PCol, Set<string> | null>>>({})

  const values = useMemo(() => {
    const out = {} as Record<PCol, FilterValue[]>
    for (const key of Object.keys(pColValue) as PCol[]) {
      const counts = new Map<string, number>()
      for (const p of rows) {
        const v = pColValue[key](p)
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      out[key] = [...counts.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    }
    return out
  }, [rows])

  const shown = useMemo(() => {
    let list = rows.filter((p) =>
      (Object.keys(pColValue) as PCol[]).every((key) => {
        const sel = filters[key]
        return !sel || sel.has(pColValue[key](p))
      })
    )
    const active = sort ?? { key: 'num' as PCol, dir: 'asc' as SortDir }
    const dir = active.dir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      const va = pSortValue(active.key, a)
      const vb = pSortValue(active.key, b)
      const d = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { numeric: true })
      return d * dir
    })
    return list
  }, [rows, sort, filters])

  const th = 'sticky top-0 z-10 bg-[#f0f3ff] text-[9px] font-semibold text-gray-500 border-b border-[#e8eaff] px-1.5 py-1.5 whitespace-nowrap'
  const iconBtn = 'inline-flex items-center justify-center w-7 h-7 rounded transition-colors'
  const iconOff = `${iconBtn} text-gray-300 bg-gray-50 cursor-not-allowed`

  const header = (label: string, key: PCol, align: 'left' | 'right' | 'center' = 'center') => (
    <th className={`${th} ${key === 'name' ? 'text-start' : ''}`}>
      {label}
      <ColumnHeaderMenu
        sortKind={pColNumeric.has(key) ? 'numeric' : 'text'}
        sortDir={sort?.key === key ? sort.dir : null}
        onSort={(dir) => setSort(dir ? { key, dir } : null)}
        values={values[key]}
        selected={filters[key] ?? null}
        onFilter={(next) => setFilters((f) => ({ ...f, [key]: next }))}
        align={align}
      />
    </th>
  )

  return (
    <table className="w-full border-collapse min-w-[620px]">
      <thead>
        <tr>
          {header('Project', 'name', 'right')}
          {header('#', 'num')}
          {header('ACC', 'acc')}
          {header('Drive', 'drive')}
          {header('Monday', 'monday')}
          {header('BIM Mgmt', 'bim')}
          {header('MEP', 'mep')}
          {header('Modeller', 'mod')}
          {header('Hours', 'hours', 'left')}
          {header('Milestones', 'mile', 'left')}
        </tr>
      </thead>
      <tbody>
        {shown.map((p) => {
          const mondayHref = mondayHrefOf(p)
          return (
            <tr key={p._id} className="hover:bg-white/60">
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-start">
                <a
                  href={`/dashboard/${p._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open project page in a new tab"
                  className="text-[11px] font-semibold text-gray-800 hover:text-[#1e248c] hover:underline whitespace-nowrap"
                >
                  <bdi>{p.projectName}</bdi>
                </a>
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center font-mono text-[10px] text-[#44b8d3]" dir="ltr">
                {p.projectNumber}
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center">
                {p.links.acc ? (
                  <a href={p.links.acc} target="_blank" rel="noopener noreferrer" title="Open in Autodesk ACC"
                    className={`${iconBtn} text-cyan-700 bg-cyan-50 hover:bg-cyan-100`}>
                    <Cloud size={13} />
                  </a>
                ) : (
                  <span title="No ACC project linked" className={iconOff}><Cloud size={13} /></span>
                )}
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center">
                {p.links.driveFolder ? (
                  <a href={p.links.driveFolder} target="_blank" rel="noopener noreferrer" title="Open Google Drive folder"
                    className={`${iconBtn} text-[#00687a] bg-teal-50 hover:bg-teal-100`}>
                    <FolderOpen size={13} />
                  </a>
                ) : (
                  <span title="No Drive folder linked" className={iconOff}><FolderOpen size={13} /></span>
                )}
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center">
                {mondayHref ? (
                  <a href={mondayHref} target="_blank" rel="noopener noreferrer" title="Open Monday board"
                    className={`${iconBtn} text-[#1e248c] bg-blue-50 hover:bg-blue-100`}>
                    <LayoutGrid size={13} />
                  </a>
                ) : (
                  <span title="No Monday board linked" className={iconOff}><LayoutGrid size={13} /></span>
                )}
              </td>
              <td className="border-b border-[#eef0fb] px-1 py-1"><TeamMemberCell member={p.bimManager} /></td>
              <td className="border-b border-[#eef0fb] px-1 py-1"><TeamMemberCell member={p.mepCoordinator} /></td>
              <td className="border-b border-[#eef0fb] px-1 py-1"><TeamMemberCell member={p.bimModeller} /></td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center" dir="ltr">
                <a
                  href={`/dashboard/${p._id}/hours`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open hours analytics${p.actualHours != null && p.budgetHours != null ? ` — ${Math.round(p.actualHours)} / ${Math.round(p.budgetHours)} hrs` : ''}`}
                  className="block hover:opacity-70 transition-opacity"
                >
                  <ProgressBar value={p.hoursProgress} />
                </a>
              </td>
              <td className="border-b border-[#eef0fb] px-1.5 py-1 text-center" dir="ltr">
                <ProgressBar value={p.milestoneProgress} neutral />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Sticky table header cell with the Excel-style sort/filter menu.
function MenuTh({ label, sortKind = 'text', sortDir, onSort, values, selected, onFilter, align = 'center', start }: {
  label: string
  sortKind?: 'text' | 'numeric'
  sortDir: SortDir | null
  onSort: (dir: SortDir | null) => void
  values?: FilterValue[]
  selected?: Set<string> | null
  onFilter?: (next: Set<string> | null) => void
  align?: 'left' | 'right' | 'center'
  start?: boolean
}) {
  return (
    <th className={`sticky top-0 z-10 bg-[#f0f3ff] text-[9px] font-semibold text-gray-500 border-b border-[#e8eaff] px-1.5 py-1.5 whitespace-nowrap ${start ? 'text-start' : ''}`}>
      {label}
      <ColumnHeaderMenu
        sortKind={sortKind}
        sortDir={sortDir}
        onSort={onSort}
        values={values}
        selected={selected}
        onFilter={onFilter}
        align={align}
      />
    </th>
  )
}

function Skeleton({ note }: { note?: string }) {
  return (
    <div className="pt-1">
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 rounded-lg bg-[#eef0fb]" />)}
      </div>
      {note && <p className="text-[10px] text-gray-400 mt-2">{note}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-500 leading-relaxed pt-2">{children}</p>
}
