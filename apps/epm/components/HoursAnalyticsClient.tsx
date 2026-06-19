'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Tooltip, ResponsiveContainer, LabelList,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { ProjectRow } from '@/lib/types'

// ── Types (mirror mondayService) ─────────────────────────────────────────────

interface HoursBreakdown {
  months: {
    month:      string                   // 'YYYY-MM', ascending
    bySubject:  Record<string, number>
    byEmployee: Record<string, number>
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

const NAVY = '#1e248c'
const CYAN = '#44b8d3'
const GREY = '#9ca3af'

// Colour palettes, assigned by stable ordering so colours don't shift.
const SUBJECT_PALETTE = [NAVY, CYAN, GREY, '#f59e0b', '#10b981', '#a855f7', '#ef4444']
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

// ── Main component ────────────────────────────────────────────────────────

export default function HoursAnalyticsClient({ project }: { project: ProjectRow }) {
  const [breakdown, setBreakdown] = useState<HoursBreakdown | null>(null)
  const [banks, setBanks]         = useState<DisciplineBanks | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

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

  const actual = project.actualHours ?? 0
  const budget = project.budgetHours ?? 0

  // Per-Subject totals for the KPI cards.
  const modelMgmtHours     = breakdown?.totalsBySubject['Model MGMT']    ?? 0
  const superpositionHours = breakdown?.totalsBySubject['Superposition'] ?? 0

  const totalCard         = bankCardContent(loading, actual, budget)
  const modelMgmtCard     = bankCardContent(loading, modelMgmtHours, banks?.modelMgmt)
  const superpositionCard = bankCardContent(loading, superpositionHours, banks?.superposition)

  // Stable colour maps.
  const colorForSubject = useMemo(() => {
    const subjects = breakdown?.subjects ?? []
    return (s: string) => SUBJECT_PALETTE[Math.max(0, subjects.indexOf(s)) % SUBJECT_PALETTE.length]
  }, [breakdown])

  const colorForEmployee = useMemo(() => {
    const employees = breakdown?.employees ?? []
    return (e: string) => EMPLOYEE_PALETTE[Math.max(0, employees.indexOf(e)) % EMPLOYEE_PALETTE.length]
  }, [breakdown])

  const months = breakdown?.months ?? []

  const subjectChartData = useMemo(
    () => months.map(m => ({ label: fmtMonth(m.month), ...m.bySubject })),
    [months]
  )
  const employeeChartData = useMemo(
    () => months.map(m => ({ label: fmtMonth(m.month), ...m.byEmployee })),
    [months]
  )

  const subjectsInRange  = breakdown?.subjects  ?? []
  const employeesInRange = breakdown?.employees ?? []

  const hasSubjectData  = subjectsInRange.length > 0
  const hasEmployeeData = employeesInRange.length > 0

  const subjectTotalLabel  = makeTotalLabel(subjectChartData, subjectsInRange)
  const employeeTotalLabel = makeTotalLabel(employeeChartData, employeesInRange)

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Title row */}
        <div>
          <Breadcrumb project={project} />
          <h1 className="text-3xl font-bold text-[#1e248c] mt-1">
            Hours Analytics –{' '}
            <span dir="rtl" className="inline-block">{project.projectName}</span>
          </h1>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard label="Total Spent vs Banked"            value={totalCard.value}         sub={totalCard.sub} />
          <KpiCard label="Spent vs Banked · Model MGMT"     value={modelMgmtCard.value}     sub={modelMgmtCard.sub} />
          <KpiCard label="Spent vs Banked · Superposition"  value={superpositionCard.value} sub={superpositionCard.sub} />
        </div>

        {/* Hours Spent by Discipline — full width */}
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
        </div>

        {/* Hours by Employee — full width */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-[#1e248c] text-sm">Hours by Employee</h2>
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
                  {employeesInRange.map((e, i) => {
                    const isLast = i === employeesInRange.length - 1
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
              {employeesInRange.map(e => {
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
