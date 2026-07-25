'use client'

import { useMemo, useState } from 'react'
import { BarChart3, X } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import type { AccIssue } from '@/lib/services/apsService'
import { groupValue, issueMonthKey, normalizeStatus, statusLabel } from '@/lib/reportGrouping'
import MultiSelect from './MultiSelect'

// groupBy is a plain string: base dimensions + dynamic "attr:<Title>" values.
type GroupKey = string

const STATUS_LABEL_COLORS: Record<string, string> = {
  'Open': '#FAA21B', 'Pending': '#0696D7', 'In Progress': '#A3BCDC',
  'Completed': '#B7D78C', 'Closed': '#DCDCDC', 'Draft': '#1f2937',
}
// Categorical palette for non-status dimensions.
const PALETTE = [
  '#1e248c', '#44b8d3', '#FAA21B', '#5FA320', '#DB1F35', '#9b59b6',
  '#F47C20', '#0696D7', '#16a085', '#e67e22', '#8e44ad', '#2c3e50',
  '#c0392b', '#27ae60', '#2980b9', '#d35400', '#7f8c8d', '#f1c40f',
]

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// Renders the column's total count above the top-most stacked bar.
function makeTotalLabel(data: Record<string, number | string>[], keys: string[]) {
  return function TotalLabel(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) {
    const x = Number(props.x) || 0
    const y = Number(props.y) || 0
    const width = Number(props.width) || 0
    const row = data[props.index ?? 0]
    if (!row) return null
    const total = keys.reduce((s, k) => s + (Number(row[k]) || 0), 0)
    if (!total) return null
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1e248c">
        {total}
      </text>
    )
  }
}

// Per-segment count label (blank for empty segments).
const segFormatter = (v: unknown) => { const n = Number(v); return n >= 1 ? String(n) : '' }

export default function IssuesByMonthChart({
  issues, groupBy, groupLabel, selectedMonth, onSelectMonth,
}: {
  issues: AccIssue[]
  groupBy: GroupKey
  groupLabel: string
  // Month currently driving the page-wide filter (highlighted / clearable here).
  selectedMonth: string | null
  // Click a month column → filter the whole page by that month. Pass same month to toggle off.
  onSelectMonth: (monthKey: string) => void
}) {
  // Per-chart status filter. `null` = untouched → default of "all statuses except
  // Closed" (so freshly-closed noise stays hidden until the user opts in).
  const [selStatuses, setSelStatuses] = useState<string[] | null>(null)

  // Distinct statuses present, ordered for a stable filter list.
  const chartStatuses = useMemo(
    () => [...new Set(issues.map(i => i.status))].filter(Boolean),
    [issues]
  )
  const activeStatuses = selStatuses ?? chartStatuses.filter(s => normalizeStatus(s) !== 'closed')

  const { data, keys, colorOf } = useMemo(() => {
    // Only the statuses the user has chosen to chart (default excludes Closed).
    const chartIssues = issues.filter(i => activeStatuses.includes(i.status))
    if (chartIssues.length === 0) return { data: [], keys: [] as string[], colorOf: () => '#ccc' }

    // Bucket counts: month → group value → count
    const byMonth = new Map<string, Map<string, number>>()
    const totals = new Map<string, number>()
    let minKey = '9999-99', maxKey = '0000-00'

    for (const issue of chartIssues) {
      const mk = issueMonthKey(issue.createdAt)
      if (mk < minKey) minKey = mk
      if (mk > maxKey) maxKey = mk
      const gv = groupValue(issue, groupBy)
      const mm = byMonth.get(mk) ?? new Map<string, number>()
      mm.set(gv, (mm.get(gv) ?? 0) + 1)
      byMonth.set(mk, mm)
      totals.set(gv, (totals.get(gv) ?? 0) + 1)
    }

    // Stack keys ordered by overall frequency (largest stacks at the bottom)
    const keys = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)

    // Continuous month axis from min → max
    const [minY, minM] = minKey.split('-').map(Number)
    const [maxY, maxM] = maxKey.split('-').map(Number)
    const data: Record<string, number | string>[] = []
    for (let y = minY, m = minM; y < maxY || (y === maxY && m <= maxM); m === 12 ? (y++, m = 1) : m++) {
      const mk = `${y}-${String(m).padStart(2, '0')}`
      // `_mk` carries the raw month key so a click can filter the page.
      const row: Record<string, number | string> = { month: monthLabel(mk), _mk: mk }
      const mm = byMonth.get(mk)
      for (const k of keys) row[k] = mm?.get(k) ?? 0
      data.push(row)
    }

    // Status keeps its semantic colors; other dims cycle the palette.
    const colorIndex = new Map(keys.map((k, i) => [k, i]))
    const colorOf = (k: string) =>
      groupBy === 'status'
        ? (STATUS_LABEL_COLORS[k] ?? PALETTE[(colorIndex.get(k) ?? 0) % PALETTE.length])
        : PALETTE[(colorIndex.get(k) ?? 0) % PALETTE.length]

    return { data, keys, colorOf }
  }, [issues, groupBy, activeStatuses])

  // The visually-topmost stacked bar (last drawn) carries the total-on-top label.
  const totalLabel = makeTotalLabel(data, keys)

  return (
    <div className="glass-card rounded-2xl p-5 lg:col-span-2 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
          <BarChart3 size={14} className="text-[#44b8d3]" /> Issues Created by Month
        </h2>
        <div className="flex items-center gap-2">
          <MultiSelect
            size="sm"
            placeholder="Statuses"
            options={chartStatuses}
            renderLabel={statusLabel}
            selected={activeStatuses}
            onChange={setSelStatuses}
          />
          <span className="text-[11px] text-gray-400 whitespace-nowrap">Stacked by {groupLabel}</span>
        </div>
      </div>

      {selectedMonth && (
        <button
          onClick={() => onSelectMonth(selectedMonth)}
          title="Clear the month filter"
          className="self-start inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-[#e7eefe] text-[#1e248c] hover:bg-[#d8ddff] transition-colors"
        >
          <span className="text-[10px] opacity-70">month:</span>
          {monthLabel(selectedMonth)}
          <X size={12} />
        </button>
      )}

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-10">
          No issues to chart.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data}
              margin={{ top: 18, right: 8, left: -16, bottom: 4 }}
              onClick={state => {
                const idx = state.activeIndex
                const row = typeof idx === 'number' ? data[idx] : undefined
                const mk = row?._mk
                if (typeof mk === 'string') onSelectMonth(mk)
              }}
              className="cursor-pointer"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f5" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                angle={-35}
                textAnchor="end"
                height={46}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip
                cursor={{ fill: 'rgba(30,36,140,0.06)' }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                itemStyle={{ padding: 0 }}
              />
              {keys.map((k, i) => {
                const isLast = i === keys.length - 1
                return (
                  <Bar key={k} dataKey={k} stackId="a" fill={colorOf(k)} maxBarSize={48}>
                    {/* Per-segment count, centered; blank for empty segments. */}
                    <LabelList dataKey={k} position="center" fill="#fff" fontSize={9} fontWeight={700} formatter={segFormatter} />
                    {/* Column total above the top-most stacked bar. */}
                    {isLast && <LabelList content={totalLabel} />}
                  </Bar>
                )
              })}
            </BarChart>
          </ResponsiveContainer>

          {/* Compact legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 max-h-20 overflow-auto pt-1">
            {keys.map(k => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: colorOf(k) }} />
                <span className="truncate max-w-[120px]" title={k}>{k}</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 -mt-1">Click a month to filter the whole page</p>
        </>
      )}
    </div>
  )
}
