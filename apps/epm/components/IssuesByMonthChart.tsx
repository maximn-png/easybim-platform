'use client'

import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { AccIssue } from '@/lib/services/apsService'

// Keep in sync with the page's "Stack by" dimensions.
type GroupKey = 'assignedTo' | 'discipline' | 'status' | 'issueType'

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', draft: 'Draft', pending: 'Pending',
  inProgress: 'In Progress', in_progress: 'In Progress',
  completed: 'Completed', resolved: 'Completed', closed: 'Closed',
}
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

function groupValue(issue: AccIssue, groupBy: GroupKey): string {
  switch (groupBy) {
    case 'status':     return STATUS_LABELS[issue.status] ?? issue.status
    case 'discipline': return issue.discipline?.trim() || 'No Discipline'
    case 'issueType':  return issue.issueType?.trim() || 'Other'
    case 'assignedTo':
    default:           return issue.assignedTo?.trim() || 'Unassigned'
  }
}

const monthKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default function IssuesByMonthChart({
  issues, groupBy, groupLabel,
}: {
  issues: AccIssue[]
  groupBy: GroupKey
  groupLabel: string
}) {
  const { data, keys, colorOf } = useMemo(() => {
    // Exclude closed issues from this chart entirely.
    const chartIssues = issues.filter(i => i.status !== 'closed')
    if (chartIssues.length === 0) return { data: [], keys: [] as string[], colorOf: () => '#ccc' }

    // Bucket counts: month → group value → count
    const byMonth = new Map<string, Map<string, number>>()
    const totals = new Map<string, number>()
    let minKey = '9999-99', maxKey = '0000-00'

    for (const issue of chartIssues) {
      const mk = monthKey(issue.createdAt)
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
      const row: Record<string, number | string> = { month: monthLabel(mk) }
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
  }, [issues, groupBy])

  return (
    <div className="glass-card rounded-2xl p-5 lg:col-span-2 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
          <BarChart3 size={14} className="text-[#44b8d3]" /> Issues Created by Month
        </h2>
        <span className="text-[11px] text-gray-400">Stacked by {groupLabel}</span>
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-10">
          No issues to chart.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
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
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                itemStyle={{ padding: 0 }}
              />
              {keys.map(k => (
                <Bar key={k} dataKey={k} stackId="a" fill={colorOf(k)} maxBarSize={48} />
              ))}
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
        </>
      )}
    </div>
  )
}
