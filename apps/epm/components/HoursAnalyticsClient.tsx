'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { ChevronRight, Check, SlidersHorizontal, X } from 'lucide-react'
import {
  Tooltip, ResponsiveContainer, LabelList,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { ProjectRow, HoursTeam } from '@/lib/types'

// ── Types (mirror mondayService) ─────────────────────────────────────────────

interface HoursBreakdown {
  months: {
    month:      string                   // 'YYYY-MM', ascending
    bySubject:  Record<string, number>
    byEmployee: Record<string, number>
    bySubjectEmployee?: Record<string, Record<string, number>>  // subject → employee → hours
  }[]
  subjects:         string[]
  employees:        string[]
  totalsBySubject:  Record<string, number>
  totalsByEmployee: Record<string, number>
  employeeAvatars:  Record<string, string>
}

interface DisciplineBanks {
  modelMgmt:     number | null
  superposition: number | null
}

const EMPTY_BREAKDOWN: HoursBreakdown = {
  months: [], subjects: [], employees: [], totalsBySubject: {}, totalsByEmployee: {}, employeeAvatars: {},
}

// Palette for the per-subject discipline chart, assigned by stable ordering.
const SUBJECT_PALETTE = [
  '#1e248c', '#44b8d3', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16', '#06b6d4', '#eab308',
]

// ── Subject → team mapping ───────────────────────────────────────────────────
// The two discipline "teams" the bank KPI cards + discipline chart group by.
const TEAM_MODEL_MGMT     = 'Model MGMT'
const TEAM_SUPERPOSITION  = 'Superposition'

// Canonical subjects default to their namesake team; everything else defaults to
// 'none' (not counted) until the user assigns it on the page.
const CANONICAL_DEFAULT: Record<string, HoursTeam> = {
  [TEAM_MODEL_MGMT]:    'modelMgmt',
  [TEAM_SUPERPOSITION]: 'superposition',
}

const TEAM_OPTIONS: { value: HoursTeam; label: string }[] = [
  { value: 'modelMgmt',     label: 'Model MGMT' },
  { value: 'superposition', label: 'Superposition' },
  { value: 'none',          label: 'Not counted' },
]

// Colour palette, assigned by stable ordering so colours don't shift.
const EMPLOYEE_PALETTE = [
  '#1e248c', '#44b8d3', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16', '#06b6d4', '#eab308',
]

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// '2023-07' → 'Jul 23'
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const idx = Number(m) - 1
  return `${MONTH_ABBR[idx] ?? m} ${y.slice(2)}`
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
}

const round1 = (n: number) => Math.round(n * 10) / 10

// ── Helpers ────────────────────────────────────────────────────────────────

function Breadcrumb({ project }: { project: ProjectRow }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500 mb-1">
      <Link href="/dashboard" className="hover:text-[#1e248c]">Dashboard</Link>
      <ChevronRight size={12} />
      <Link href="/dashboard" className="hover:text-[#1e248c]">EPM</Link>
      <ChevronRight size={12} />
      <Link href={`/dashboard/${project._id}`} className="hover:text-[#1e248c]" dir="rtl">{project.projectName}</Link>
      <ChevronRight size={12} />
      <span className="text-[#1e248c] font-medium">Hours Analytics</span>
    </nav>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-2">
      <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <span className="text-3xl font-bold text-[#1e248c] mt-auto">{value}</span>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}

function ChartPlaceholder({ message, minHeight = 240 }: { message: string; minHeight?: number }) {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-400" style={{ minHeight }}>
      {message}
    </div>
  )
}

// Renders the stack total above each bar. Attach to the topmost <Bar> in a stack.
function makeTotalLabel(data: Record<string, number | string>[], keys: string[]) {
  return function TotalLabel(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) {
    const x = Number(props.x) || 0
    const y = Number(props.y) || 0
    const width = Number(props.width) || 0
    const index = props.index ?? 0
    const row = data[index]
    if (!row) return null
    const total = keys.reduce((s, k) => s + (Number(row[k]) || 0), 0)
    if (!total) return null
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#374151">
        {round1(total)}
      </text>
    )
  }
}

// Hide labels for tiny segments to avoid clutter.
const segmentFormatter = (v: unknown) => {
  const n = Number(v)
  return n >= 2 ? round1(n) : ''
}

// Build the value/sub for a "spent vs banked" card given spent hours and a bank.
function bankCardContent(loading: boolean, spent: number, bank: number | null | undefined) {
  if (loading) return { value: '—', sub: '' }
  if (bank && bank > 0) {
    return {
      value: `${Math.round((spent / bank) * 100)}%`,
      sub: `${Math.round(spent).toLocaleString()} / ${Math.round(bank).toLocaleString()} hrs`,
    }
  }
  return { value: Math.round(spent).toLocaleString(), sub: 'hrs spent' }
}

// Compact top-right control to assign each timesheet Subject to a discipline
// team. Collapsed to a small button; expands to a popover on click.
function TeamMappingPanel({
  subjects, totals, teamFor, onAssign, saveState,
}: {
  subjects: string[]
  totals: Record<string, number>
  teamFor: (s: string) => HoursTeam
  onAssign: (subject: string, team: HoursTeam) => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (subjects.length === 0) return null

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors"
      >
        <SlidersHorizontal size={13} />
        Team mapping
        {saveState === 'saving' ? (
          <span className="text-gray-400 font-normal">· Saving…</span>
        ) : saveState === 'saved' ? (
          <Check size={12} className="text-green-600" />
        ) : saveState === 'error' ? (
          <span className="text-red-500 font-normal">· Save failed</span>
        ) : null}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 z-20 glass-card rounded-2xl p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[11px] text-gray-500 leading-snug">
              Which team each subject counts toward. “Not counted” is excluded from both banks.
            </p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-0.5">
            {subjects.map(s => {
              const team = teamFor(s)
              return (
                <div key={s} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-700 truncate" title={s}>
                    {s}
                    <span className="text-gray-400 ml-1">· {round1(totals[s] ?? 0)}h</span>
                  </span>
                  <select
                    value={team}
                    onChange={e => onAssign(s, e.target.value as HoursTeam)}
                    className={`text-[11px] rounded-md border px-1.5 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1e248c] shrink-0 ${
                      team === 'none' ? 'border-gray-200 text-gray-400' : 'border-[#1e248c]/30 text-[#1e248c]'
                    }`}
                  >
                    {TEAM_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function HoursAnalyticsClient({ project }: { project: ProjectRow }) {
  const [breakdown, setBreakdown] = useState<HoursBreakdown | null>(null)
  const [banks, setBanks]         = useState<DisciplineBanks | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  // Per-project Subject → team overrides (canonical subjects fall back to their
  // namesake team; everything else to 'none'). Persisted via hours-config route.
  const [subjectTeam, setSubjectTeam] = useState<Record<string, HoursTeam>>(
    () => project.hoursConfig?.subjectTeam ?? {}
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Discipline filter for the "Hours by Employee" chart ('all' = every subject).
  const [empDiscipline, setEmpDiscipline] = useState<string>('all')

  const teamFor = useCallback(
    (subject: string): HoursTeam => subjectTeam[subject] ?? CANONICAL_DEFAULT[subject] ?? 'none',
    [subjectTeam]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/projects/${project._id}/hours-breakdown`)
      .then(res => res.json())
      .then((json: { breakdown?: HoursBreakdown; banks?: DisciplineBanks; error?: string }) => {
        if (cancelled) return
        if (json.error) { setError(json.error); return }
        setBreakdown(json.breakdown ?? EMPTY_BREAKDOWN)
        setBanks(json.banks ?? null)
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [project._id])

  // Clean up any pending debounced save on unmount.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Assign a subject to a team. Updates the chart/KPIs instantly and debounces a
  // save of the full effective map (so canonical defaults are persisted too).
  const assignTeam = useCallback((subject: string, team: HoursTeam) => {
    setSubjectTeam(prev => {
      const next = { ...prev, [subject]: team }

      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = setTimeout(() => {
        // Persist the effective team for every subject currently in range.
        const payload: Record<string, HoursTeam> = {}
        for (const s of breakdown?.subjects ?? []) {
          payload[s] = next[s] ?? CANONICAL_DEFAULT[s] ?? 'none'
        }
        fetch(`/api/projects/${project._id}/hours-config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectTeam: payload }),
        })
          .then(res => { if (!res.ok) throw new Error('save failed'); return res.json() })
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, 600)

      return next
    })
  }, [breakdown, project._id])

  const actual = project.actualHours ?? 0
  const budget = project.budgetHours ?? 0

  // Bank totals: sum every subject the user has assigned to each team.
  let modelMgmtHours = 0
  let superpositionHours = 0
  let notCountedHours = 0
  const notCountedSubjects: string[] = []
  for (const [s, v] of Object.entries(breakdown?.totalsBySubject ?? {})) {
    const t = teamFor(s)
    if (t === 'modelMgmt')          modelMgmtHours += v
    else if (t === 'superposition') superpositionHours += v
    else { notCountedHours += v; notCountedSubjects.push(s) }
  }

  const totalCard         = bankCardContent(loading, actual, budget)
  const modelMgmtCard     = bankCardContent(loading, modelMgmtHours, banks?.modelMgmt)
  const superpositionCard = bankCardContent(loading, superpositionHours, banks?.superposition)

  // Stable colour map for employees (by global ordering, so filtering doesn't shift colours).
  const colorForEmployee = useMemo(() => {
    const employees = breakdown?.employees ?? []
    return (e: string) => EMPLOYEE_PALETTE[Math.max(0, employees.indexOf(e)) % EMPLOYEE_PALETTE.length]
  }, [breakdown])

  const months = breakdown?.months ?? []

  const subjectsInRange  = breakdown?.subjects  ?? []

  // Discipline chart: one stacked series per subject (all disciplines).
  const colorForSubject = useMemo(() => {
    const subjects = breakdown?.subjects ?? []
    return (s: string) => SUBJECT_PALETTE[Math.max(0, subjects.indexOf(s)) % SUBJECT_PALETTE.length]
  }, [breakdown])

  const subjectChartData = useMemo(
    () => months.map(m => ({ label: fmtMonth(m.month), ...m.bySubject })),
    [months]
  )

  // Employee chart, filtered by discipline ('all' = every subject). Reuse the
  // per-month subject→employee matrix; recompute the series/totals per filter.
  const { employeeChartData, employeeSeries } = useMemo(() => {
    const totals: Record<string, number> = {}
    const data = months.map(m => {
      const emp = empDiscipline === 'all'
        ? m.byEmployee
        : (m.bySubjectEmployee?.[empDiscipline] ?? {})
      for (const [e, h] of Object.entries(emp)) totals[e] = (totals[e] ?? 0) + h
      return { label: fmtMonth(m.month), ...emp }
    })
    const series = Object.keys(totals).sort((a, b) => totals[b] - totals[a])
    return { employeeChartData: data, employeeSeries: series }
  }, [months, empDiscipline])

  const hasSubjectData  = subjectsInRange.length > 0
  const hasEmployeeData = employeeSeries.length > 0

  const subjectTotalLabel  = makeTotalLabel(subjectChartData, subjectsInRange)
  const employeeTotalLabel = makeTotalLabel(employeeChartData, employeeSeries)

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Title row — compact Team Mapping control sits at the top-right */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <Breadcrumb project={project} />
            <h1 className="text-3xl font-bold text-[#1e248c] mt-1">
              Hours Analytics –{' '}
              <span dir="rtl" className="inline-block">{project.projectName}</span>
            </h1>
          </div>
          {!loading && !error && hasSubjectData && (
            <TeamMappingPanel
              subjects={subjectsInRange}
              totals={breakdown?.totalsBySubject ?? {}}
              teamFor={teamFor}
              onAssign={assignTeam}
              saveState={saveState}
            />
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label="Total Spent vs Banked"            value={totalCard.value}         sub={totalCard.sub} />
          <KpiCard label="Spent vs Banked · Model MGMT"     value={modelMgmtCard.value}     sub={modelMgmtCard.sub} />
          <KpiCard label="Spent vs Banked · Superposition"  value={superpositionCard.value} sub={superpositionCard.sub} />
        </div>

        {/* Hours Spent by Discipline — full width, one series per subject */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[#1e248c] text-sm whitespace-nowrap">Hours Spent by Discipline</h2>
            <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap justify-end">
              {subjectsInRange.map(s => (
                <span key={s} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: colorForSubject(s) }} /> {s}
                </span>
              ))}
            </div>
          </div>
          <div style={{ minHeight: 280 }}>
            {loading ? (
              <ChartPlaceholder message="Loading…" minHeight={280} />
            ) : error ? (
              <ChartPlaceholder message="Couldn’t load hours data" minHeight={280} />
            ) : !hasSubjectData ? (
              <ChartPlaceholder message="No timesheet data" minHeight={280} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={subjectChartData} barSize={26} barGap={2} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7eefe" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} unit="h" />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v: unknown, name: unknown) => [`${Number(v)}h`, String(name)]}
                  />
                  {subjectsInRange.map((s, i) => {
                    const isLast = i === subjectsInRange.length - 1
                    return (
                      <Bar
                        key={s}
                        dataKey={s}
                        name={s}
                        stackId="a"
                        fill={colorForSubject(s)}
                        radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      >
                        <LabelList dataKey={s} position="center" fill="#fff" fontSize={10} fontWeight={600} formatter={segmentFormatter} />
                        {isLast && <LabelList content={subjectTotalLabel} />}
                      </Bar>
                    )
                  })}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {!loading && !error && notCountedHours > 0 && (
            <p className="text-[11px] text-gray-400">
              {round1(notCountedHours)}h not assigned to a team bank ({notCountedSubjects.join(', ')})
            </p>
          )}
        </div>

        {/* Hours by Employee — full width, filterable by discipline */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[#1e248c] text-sm">Hours by Employee</h2>
            {hasSubjectData && (
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                Discipline
                <select
                  value={empDiscipline}
                  onChange={e => setEmpDiscipline(e.target.value)}
                  className="text-[11px] rounded-md border border-[#1e248c]/30 text-[#1e248c] px-1.5 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1e248c]"
                >
                  <option value="all">All disciplines</option>
                  {subjectsInRange.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div style={{ minHeight: 300 }}>
            {loading ? (
              <ChartPlaceholder message="Loading…" minHeight={300} />
            ) : error ? (
              <ChartPlaceholder message="Couldn’t load hours data" minHeight={300} />
            ) : !hasEmployeeData ? (
              <ChartPlaceholder message="No timesheet data" minHeight={300} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={employeeChartData} barSize={26} barGap={2} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7eefe" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} unit="h" />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v: unknown, name: unknown) => [`${Number(v)}h`, String(name)]}
                  />
                  {employeeSeries.map((e, i) => {
                    const isLast = i === employeeSeries.length - 1
                    return (
                      <Bar
                        key={e}
                        dataKey={e}
                        name={e}
                        stackId="emp"
                        fill={colorForEmployee(e)}
                        radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      >
                        <LabelList dataKey={e} position="center" fill="#fff" fontSize={10} fontWeight={600} formatter={segmentFormatter} />
                        {isLast && <LabelList content={employeeTotalLabel} />}
                      </Bar>
                    )
                  })}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {hasEmployeeData && (
            <div className="flex items-center gap-x-3 gap-y-2 flex-wrap justify-center pt-1">
              {employeeSeries.map(e => {
                const url = breakdown?.employeeAvatars[e]
                const color = colorForEmployee(e)
                return (
                  <span key={e} title={e} className="inline-flex">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={e}
                        className="w-7 h-7 rounded-full object-cover"
                        style={{ boxShadow: `0 0 0 2px ${color}` }}
                      />
                    ) : (
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
                        style={{ background: color }}
                      >
                        {initials(e)}
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
