'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart3, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { MeOverview, TimeEntryDTO } from '@/lib/meTypes'
import { TAXONOMY } from '@/lib/meTypes'
import ColumnHeaderMenu, { type FilterValue, type SortDir } from './ColumnHeaderMenu'

/* My hours analytics: one viewport-locked dashboard — three charts on the left,
   the detail table (Breakdown, or Logs when a bar is selected) on the right.
   Data = the signed-in user's own time_entries for the shown month. */

const INTERNAL_KEY = 'internal'
const INTERNAL_NAME = 'EasyBIM internal'
const MONTHLY_TARGET = 160
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000'

// Categorical palette for subtopics — fixed order, validated (dataviz six checks,
// light surface). Uncategorized is the neutral "Other" slot.
const SUBTOPIC_ORDER = ['Meetings', 'ProjectWork', 'Training', 'R&D', 'Social', 'Management', 'Uncategorized'] as const
const SUBTOPIC_COLORS: Record<string, string> = {
  Meetings: '#3a46c9',
  ProjectWork: '#44b8d3',
  Training: '#7c5cd6',
  'R&D': '#e08a2e',
  Social: '#d4589e',
  Management: '#4f9e5c',
  Uncategorized: '#9ca3af',
}

function toYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function MyAnalyticsClient() {
  const [monthStart, setMonthStart] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [entries, setEntries] = useState<TimeEntryDTO[]>([])
  const [overview, setOverview] = useState<MeOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Drill-down: a project, a subject, or a subtopic — from the charts / table.
  const [selection, setSelection] = useState<
    | { type: 'project'; label: string }
    | { type: 'subject'; subject: string }
    | { type: 'subtopic'; subtopic: string }
    | null
  >(null)

  useEffect(() => {
    fetch('/api/me/overview')
      .then((r) => r.json() as Promise<{ overview?: MeOverview }>)
      .then((data) => setOverview(data.overview ?? null))
      .catch(() => {})
  }, [])

  const loadMonth = async () => {
    const start = toYMD(monthStart)
    const end = toYMD(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
    try {
      const res = await fetch(`/api/me/time-entries?start=${start}&end=${end}`)
      const data = await res.json() as { entries?: TimeEntryDTO[]; error?: string }
      if (data.error) { setError(data.error); return }
      setEntries(data.entries ?? [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setSelection(null)
    loadMonth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart])

  const projectLabel = useMemo(() => {
    const map = new Map<string, string>()
    map.set(INTERNAL_KEY, INTERNAL_NAME)
    for (const p of overview?.allProjects ?? []) {
      map.set(p._id, `${p.projectNumber ? `${p.projectNumber} ` : ''}${p.projectName}`)
    }
    return (e: TimeEntryDTO) => map.get(e.projectKey) ?? e.projectName ?? 'Unknown project'
  }, [overview])

  const normSubtopic = (e: TimeEntryDTO) => (e.subtopic && SUBTOPIC_COLORS[e.subtopic] ? e.subtopic : 'Uncategorized')

  const totalHours = useMemo(() => entries.reduce((s, e) => s + e.hours, 0), [entries])

  // Hours by project, sorted descending.
  const byProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      const label = projectLabel(e)
      map.set(label, (map.get(label) ?? 0) + e.hours)
    }
    return [...map.entries()]
      .map(([label, hours]) => ({ label, hours: Math.round(hours * 4) / 4 }))
      .sort((a, b) => b.hours - a.hours)
  }, [entries, projectLabel])

  // Hours by Subject, one stacked segment per Subtopic.
  const bySubject = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const e of entries) {
      const subject = e.subject || 'Uncategorized'
      const sub = normSubtopic(e)
      const row = map.get(subject) ?? {}
      row[sub] = (row[sub] ?? 0) + e.hours
      map.set(subject, row)
    }
    return [...map.entries()]
      .map(([subject, subs]) => ({ subject, ...subs, __total: Object.values(subs).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.__total - a.__total)
  }, [entries])

  const usedSubtopics = useMemo(
    () => SUBTOPIC_ORDER.filter((s) => entries.some((e) => normSubtopic(e) === s)),
    [entries]
  )

  // Hours by subtopic (across all subjects and projects), fixed palette order.
  const bySubtopic = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      const s = normSubtopic(e)
      map.set(s, (map.get(s) ?? 0) + e.hours)
    }
    return SUBTOPIC_ORDER
      .filter((s) => map.has(s))
      .map((s) => ({ subtopic: s, hours: Math.round((map.get(s) ?? 0) * 4) / 4 }))
  }, [entries])

  // Aggregated detail (the default right-panel table).
  const tableRows = useMemo(() => {
    const map = new Map<string, { project: string; subject: string; subtopic: string; hours: number }>()
    for (const e of entries) {
      const key = `${projectLabel(e)}|${e.subject}|${e.subtopic}`
      const row = map.get(key) ?? { project: projectLabel(e), subject: e.subject || '—', subtopic: e.subtopic || '—', hours: 0 }
      row.hours += e.hours
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours)
  }, [entries, projectLabel])

  // Breakdown column sort + checkbox filters (same menu as the dashboard table).
  type BdColumn = 'project' | 'subject' | 'subtopic'
  const [bdSort, setBdSort] = useState<{ key: BdColumn | 'hours'; dir: SortDir } | null>(null)
  const [bdFilters, setBdFilters] = useState<Partial<Record<BdColumn, Set<string> | null>>>({})

  const bdValues = useMemo(() => {
    const make = (get: (r: typeof tableRows[number]) => string): FilterValue[] => {
      const counts = new Map<string, number>()
      for (const r of tableRows) counts.set(get(r), (counts.get(get(r)) ?? 0) + 1)
      return [...counts.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    }
    return {
      project: make((r) => r.project),
      subject: make((r) => r.subject),
      subtopic: make((r) => r.subtopic),
    }
  }, [tableRows])

  const bdRows = useMemo(() => {
    let list = tableRows.filter((r) =>
      (!bdFilters.project || bdFilters.project.has(r.project)) &&
      (!bdFilters.subject || bdFilters.subject.has(r.subject)) &&
      (!bdFilters.subtopic || bdFilters.subtopic.has(r.subtopic))
    )
    if (bdSort) {
      const dir = bdSort.dir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) =>
        bdSort.key === 'hours'
          ? (a.hours - b.hours) * dir
          : a[bdSort.key].localeCompare(b[bdSort.key], undefined, { numeric: true }) * dir
      )
    }
    return list
  }, [tableRows, bdSort, bdFilters])
  const bdFiltered = Object.values(bdFilters).some((f) => f != null)

  // Individual logs behind the current selection (one row per saved entry).
  const logRows = useMemo(() => {
    if (!selection) return []
    const matches = entries.filter((e) =>
      selection.type === 'project'
        ? projectLabel(e) === selection.label
        : selection.type === 'subject'
          ? (e.subject || 'Uncategorized') === selection.subject
          : normSubtopic(e) === selection.subtopic
    )
    return matches
      .map((e) => ({
        date: e.date,
        projectKey: e.projectKey,
        projectName: e.projectName,
        project: projectLabel(e),
        rawSubject: e.subject,
        rawSubtopic: e.subtopic,
        subject: e.subject || '—',
        subtopic: e.subtopic || '—',
        hours: e.hours,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [selection, entries, projectLabel])

  // Edit a log directly from the table: sets the entry's hours (0 deletes it).
  // Charts and totals recompute from the updated entries automatically.
  const editLog = async (
    row: { date: string; projectKey: string; projectName?: string; rawSubject: string; rawSubtopic: string },
    hours: number
  ) => {
    const match = (e: TimeEntryDTO) =>
      e.date === row.date && e.projectKey === row.projectKey &&
      e.subject === row.rawSubject && e.subtopic === row.rawSubtopic
    const prev = entries.find(match)
    if (!prev || prev.hours === hours) return
    setEntries((es) => hours === 0 ? es.filter((e) => !match(e)) : es.map((e) => (match(e) ? { ...e, hours } : e)))
    try {
      const res = await fetch('/api/me/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: row.date,
          projectKey: row.projectKey,
          projectName: row.projectName,
          subject: row.rawSubject,
          subtopic: row.rawSubtopic,
          hours,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
    } catch (e) {
      setEntries((es) => {
        const without = es.filter((x) => !match(x))
        return [...without, prev]
      })
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Move a log to a different Subject/Subtopic: the category is part of the
  // entry's storage key, so this deletes the old slot and merges the hours
  // into the target slot (adding to any hours already there).
  const moveLog = async (
    row: { date: string; projectKey: string; projectName?: string; rawSubject: string; rawSubtopic: string; hours: number },
    subject: string,
    subtopic: string
  ) => {
    if (subject === row.rawSubject && subtopic === row.rawSubtopic) return
    const matchOld = (e: TimeEntryDTO) =>
      e.date === row.date && e.projectKey === row.projectKey &&
      e.subject === row.rawSubject && e.subtopic === row.rawSubtopic
    // Optimistic: drop the old slot, merge into the target slot.
    setEntries((es) => {
      const without = es.filter((e) => !matchOld(e))
      const target = without.find((e) =>
        e.date === row.date && e.projectKey === row.projectKey && e.subject === subject && e.subtopic === subtopic)
      if (target) {
        return without.map((e) => (e === target ? { ...e, hours: e.hours + row.hours } : e))
      }
      return [...without, { date: row.date, projectKey: row.projectKey, projectName: row.projectName, subject, subtopic, hours: row.hours }]
    })
    try {
      const del = await fetch('/api/me/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: row.date, projectKey: row.projectKey, projectName: row.projectName,
          subject: row.rawSubject, subtopic: row.rawSubtopic, hours: 0,
        }),
      })
      const delData = await del.json() as { ok?: boolean; error?: string }
      if (!delData.ok) throw new Error(delData.error ?? 'Move failed')
      const add = await fetch('/api/me/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: row.date, projectKey: row.projectKey, projectName: row.projectName,
          subject, subtopic, hours: row.hours, add: true,
        }),
      })
      const addData = await add.json() as { ok?: boolean; error?: string }
      if (!addData.ok) throw new Error(addData.error ?? 'Move failed')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await loadMonth()
    }
  }

  // Category choices per row: internal work only takes EasyBIM Internal,
  // project work takes the three project subjects.
  const subjectChoicesFor = (projectKey: string) =>
    projectKey === INTERNAL_KEY
      ? TAXONOMY.filter((t) => t.subject === 'EasyBIM Internal')
      : TAXONOMY.filter((t) => t.subject !== 'EasyBIM Internal')
  const subtopicsFor = (subject: string): readonly string[] =>
    TAXONOMY.find((t) => t.subject === subject)?.subtopics ?? []

  const monthLabel = monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const pct = Math.round((totalHours / MONTHLY_TARGET) * 100)
  const tooltipStyle = { fontSize: 11, borderRadius: 10, border: '1px solid #e8eaff' } as const

  return (
    <div className="max-w-[1800px] w-full mx-auto flex-1 min-h-0 flex flex-col">
      {/* breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <a href={PORTAL_URL} className="hover:text-[#1e248c]">Platform</a>
        <ChevronRight size={12} />
        <Link href="/me" className="hover:text-[#1e248c]">My Space</Link>
        <ChevronRight size={12} />
        <Link href="/me/hours" className="hover:text-[#1e248c]">Submit hours</Link>
        <ChevronRight size={12} />
        <span className="text-[#1e248c] font-medium">Analytics</span>
      </div>

      {/* title + hero + month nav, one line */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h1 className="text-2xl font-bold text-[#1e248c] flex items-center gap-2">
          <BarChart3 size={20} /> My hours · {monthLabel}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-[#1e248c] tabular-nums">
            {loading ? '…' : `${Math.round(totalHours * 4) / 4}h`}
            <span className="text-[11px] font-semibold text-gray-400"> / {MONTHLY_TARGET}h{!loading && ` · ${pct}%`}</span>
          </span>
          <div className="w-32 h-2 rounded-full bg-white/70 border border-white overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#e08a2e' : '#44b8d3' }}
            />
          </div>
          <div className="flex items-center gap-1">
            <MonthNavButton onClick={() => setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} title="Previous month">
              <ChevronLeft size={13} />
            </MonthNavButton>
            <button
              onClick={() => { const now = new Date(); setMonthStart(new Date(now.getFullYear(), now.getMonth(), 1)) }}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
            >
              This month
            </button>
            <MonthNavButton onClick={() => setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} title="Next month">
              <ChevronRight size={13} />
            </MonthNavButton>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
      )}

      {!loading && entries.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-[12px] text-gray-500">
          No hours logged in {monthLabel} yet — fill them on the{' '}
          <Link href="/me/hours" className="text-[#1e248c] font-semibold hover:underline">Submit hours</Link> page.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
          {/* by project — full height */}
          <section className="lg:col-span-4 glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
            <h2 className="font-semibold text-[#1e248c] text-[13px] mb-1 shrink-0">
              Hours by project
              <span className="text-[10px] font-normal text-gray-400 ml-2">click a bar for its logs</span>
            </h2>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byProject} layout="vertical" margin={{ top: 4, right: 34, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#eef0fb" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={150}
                    tick={{ fontSize: 10, fill: '#4b5563' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(v) => [`${v}h`, 'Hours']} contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="hours"
                    fill="#3a46c9"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                    cursor="pointer"
                    onClick={(d) => {
                      const label = (d as { payload?: { label?: string } })?.payload?.label
                      if (label) setSelection({ type: 'project', label })
                    }}
                  >
                    {byProject.map((p) => (
                      <Cell
                        key={p.label}
                        fill={selection?.type === 'project' && selection.label === p.label ? '#1e248c' : '#3a46c9'}
                      />
                    ))}
                    <LabelList dataKey="hours" position="right" style={{ fontSize: 10, fill: '#374151' }} formatter={(v) => `${v}h`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* by subject (top) + by subtopic (bottom) */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
            <section className="glass-card rounded-2xl p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
              <h2 className="font-semibold text-[#1e248c] text-[13px] mb-1 shrink-0">
                Hours by Subject &amp; Subtopic
                <span className="text-[10px] font-normal text-gray-400 ml-2">click for logs</span>
              </h2>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySubject} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="#eef0fb" />
                    <XAxis dataKey="subject" tick={{ fontSize: 10, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v, name) => [`${v}h`, name]} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#4b5563' }} iconSize={9} />
                    {usedSubtopics.map((s) => (
                      <Bar
                        key={s}
                        dataKey={s}
                        stackId="hours"
                        fill={SUBTOPIC_COLORS[s]}
                        stroke="#ffffff"
                        strokeWidth={1}
                        maxBarSize={48}
                        cursor="pointer"
                        onClick={(d) => {
                          const subject = (d as { payload?: { subject?: string } })?.payload?.subject
                          if (subject) setSelection({ type: 'subject', subject })
                        }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="glass-card rounded-2xl p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
              <h2 className="font-semibold text-[#1e248c] text-[13px] mb-1 shrink-0">
                Hours by Subtopic
                <span className="text-[10px] font-normal text-gray-400 ml-2">all projects · click for logs</span>
              </h2>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySubtopic} layout="vertical" margin={{ top: 4, right: 34, bottom: 0, left: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#eef0fb" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="subtopic"
                      width={100}
                      tick={{ fontSize: 10, fill: '#4b5563' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip formatter={(v) => [`${v}h`, 'Hours']} contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="hours"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={16}
                      cursor="pointer"
                      onClick={(d) => {
                        const subtopic = (d as { payload?: { subtopic?: string } })?.payload?.subtopic
                        if (subtopic) setSelection({ type: 'subtopic', subtopic })
                      }}
                    >
                      {bySubtopic.map((s) => (
                        <Cell
                          key={s.subtopic}
                          fill={SUBTOPIC_COLORS[s.subtopic] ?? '#9ca3af'}
                          opacity={selection?.type === 'subtopic' && selection.subtopic !== s.subtopic ? 0.45 : 1}
                        />
                      ))}
                      <LabelList dataKey="hours" position="right" style={{ fontSize: 10, fill: '#374151' }} formatter={(v) => `${v}h`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* detail table: Breakdown by default, Logs when a bar/row is selected */}
          <section className="lg:col-span-4 glass-card rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <h2 className="font-semibold text-[#1e248c] text-[13px]">
                {selection ? (
                  <>
                    Logs — {selection.type === 'project'
                      ? <bdi>{selection.label}</bdi>
                      : selection.type === 'subject'
                        ? `${selection.subject}`
                        : `${selection.subtopic}`}
                    <span className="text-[10px] font-normal text-gray-400 ml-2 tabular-nums">
                      {logRows.length} entr{logRows.length === 1 ? 'y' : 'ies'} · {Math.round(logRows.reduce((s, r) => s + r.hours, 0) * 4) / 4}h · editable, 0 deletes
                    </span>
                  </>
                ) : (
                  <>
                    Breakdown
                    <span className="text-[10px] font-normal text-gray-400 ml-2 tabular-nums">
                      {bdFiltered
                        ? `${bdRows.length} of ${tableRows.length} rows · ${Math.round(bdRows.reduce((s, r) => s + r.hours, 0) * 4) / 4}h`
                        : "click a row for the project's logs"}
                    </span>
                  </>
                )}
              </h2>
              {selection && (
                <button
                  onClick={() => setSelection(null)}
                  title="Back to breakdown"
                  className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500 transition-all shrink-0"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {selection ? (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Date', 'Project', 'Subject', 'Subtopic', 'Hours'].map((h) => (
                        <th key={h} className={`sticky top-0 bg-white/95 text-[10px] font-semibold text-gray-500 border-b border-[#e8eaff] px-2 py-1.5 ${h === 'Hours' ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.map((r, i) => (
                      <tr key={i} className="hover:bg-white/60">
                        <td className="text-[11px] text-gray-600 border-b border-[#eef0fb] px-2 py-1 tabular-nums whitespace-nowrap">
                          {new Date(`${r.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </td>
                        <td className="text-[11px] text-gray-800 border-b border-[#eef0fb] px-2 py-1"><bdi>{r.project}</bdi></td>
                        <td className="border-b border-[#eef0fb] px-1 py-0.5">
                          <select
                            value={r.rawSubject}
                            onChange={(e) => {
                              const subject = e.target.value
                              const subs = subtopicsFor(subject)
                              const subtopic = subs.includes(r.rawSubtopic) ? r.rawSubtopic : (subs[0] ?? '')
                              moveLog(r, subject, subtopic)
                            }}
                            className="w-full text-[10px] text-gray-700 border border-transparent rounded-md px-1 py-0.5 bg-transparent outline-none
                              hover:border-[#e8eaff] focus:bg-white focus:border-[#c5caff] focus:ring-1 focus:ring-[#44b8d3]"
                          >
                            {r.rawSubject === '' && <option value="">—</option>}
                            {subjectChoicesFor(r.projectKey).map((t) => (
                              <option key={t.subject} value={t.subject}>{t.subject}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border-b border-[#eef0fb] px-1 py-0.5">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: SUBTOPIC_COLORS[r.subtopic] ?? '#9ca3af' }} />
                            <select
                              value={r.rawSubtopic}
                              onChange={(e) => moveLog(r, r.rawSubject, e.target.value)}
                              disabled={r.rawSubject === ''}
                              title={r.rawSubject === '' ? 'Pick a Subject first' : undefined}
                              className="w-full text-[10px] text-gray-700 border border-transparent rounded-md px-1 py-0.5 bg-transparent outline-none
                                hover:border-[#e8eaff] focus:bg-white focus:border-[#c5caff] focus:ring-1 focus:ring-[#44b8d3] disabled:opacity-50"
                            >
                              {r.rawSubtopic === '' && <option value="">—</option>}
                              {subtopicsFor(r.rawSubject).map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </span>
                        </td>
                        <td className="border-b border-[#eef0fb] px-2 py-0.5 text-right">
                          <LogHoursCell value={r.hours} onCommit={(h) => editLog(r, h)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {([
                        ['Project', 'project', 'left'],
                        ['Subject', 'subject', 'left'],
                        ['Subtopic', 'subtopic', 'center'],
                        ['Hours', 'hours', 'right'],
                      ] as const).map(([label, key, align]) => (
                        <th
                          key={key}
                          className={`sticky top-0 z-10 bg-white/95 text-[10px] font-semibold text-gray-500 border-b border-[#e8eaff] px-2 py-1.5 ${key === 'hours' ? 'text-right' : 'text-left'}`}
                        >
                          {label}
                          <ColumnHeaderMenu
                            sortKind={key === 'hours' ? 'numeric' : 'text'}
                            sortDir={bdSort?.key === key ? bdSort.dir : null}
                            onSort={(dir) => setBdSort(dir ? { key, dir } : null)}
                            values={key === 'hours' ? undefined : bdValues[key]}
                            selected={key === 'hours' ? undefined : bdFilters[key] ?? null}
                            onFilter={key === 'hours' ? undefined : (next) => setBdFilters((f) => ({ ...f, [key]: next }))}
                            align={align}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bdRows.map((r, i) => (
                      <tr
                        key={i}
                        onClick={() => setSelection({ type: 'project', label: r.project })}
                        className="hover:bg-white/60 cursor-pointer"
                      >
                        <td className="text-[11px] text-gray-800 border-b border-[#eef0fb] px-2 py-1"><bdi>{r.project}</bdi></td>
                        <td className="text-[11px] text-gray-600 border-b border-[#eef0fb] px-2 py-1">{r.subject}</td>
                        <td className="text-[11px] text-gray-600 border-b border-[#eef0fb] px-2 py-1">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: SUBTOPIC_COLORS[r.subtopic] ?? '#9ca3af' }} />
                            {r.subtopic}
                          </span>
                        </td>
                        <td className="text-[11px] font-semibold text-gray-800 border-b border-[#eef0fb] px-2 py-1 text-right tabular-nums">{Math.round(r.hours * 4) / 4}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

// Editable hours cell in the Logs table: type a new value, blur/Enter saves,
// 0 (or empty) deletes the entry.
function LogHoursCell({ value, onCommit }: { value: number; onCommit: (hours: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = draft.trim() === '' ? 0 : Number(draft)
    setDraft(null)
    if (Number.isFinite(n) && n >= 0 && n <= 24) onCommit(Math.round(n * 4) / 4)
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="w-14 text-[11px] font-semibold text-gray-800 text-right tabular-nums border border-transparent rounded-md px-1 py-0.5 bg-transparent outline-none
        hover:border-[#e8eaff] focus:bg-white focus:border-[#c5caff] focus:ring-1 focus:ring-[#44b8d3]"
    />
  )
}

function MonthNavButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
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
