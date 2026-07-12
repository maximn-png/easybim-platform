'use client'

// Progress comparison between two saved reports: choose a baseline and a target
// report and see how issue statuses moved between them as a Sankey flow
// (matched per-issue via the report-compare endpoint). Opened from the
// Activity & Reports card on the project page.
import { useEffect, useMemo, useState } from 'react'
import { X, TrendingUp, Loader2, ArrowLeft } from 'lucide-react'
import { Sankey } from 'recharts'
import type { ReportListItem } from '@/lib/types'
import { statusColor, statusLabel } from '@/lib/reportGrouping'

interface CompareFlow { from: string; to: string; count: number }
interface CompareReport {
  id: string; title: string; createdAt: string; total: number
  counts: Record<string, number>
}
interface CompareData {
  from: CompareReport
  to: CompareReport
  flows: CompareFlow[]
  matchedCount: number
  disciplines: string[]
}

// Synthetic buckets produced by the compare endpoint.
const NEW_KEY = '(new)'
const REMOVED_KEY = '(removed)'

const bucketLabel = (key: string) =>
  key === NEW_KEY ? 'New' : key === REMOVED_KEY ? 'Removed' : statusLabel(key)
const bucketColor = (key: string) =>
  key === NEW_KEY || key === REMOVED_KEY ? '#9CA3AF' : statusColor(key)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Sankey node/link renderers ──────────────────────────────────────────────

interface NodePayload {
  name: string
  label: string
  color: string
  side: 'left' | 'right'
  pct: number | null
  value?: number
}

function SankeyNode(props: unknown) {
  const { x, y, width, height, payload } = props as {
    x: number; y: number; width: number; height: number; payload: NodePayload
  }
  if (!payload || height <= 0) return <g />
  const isLeft = payload.side === 'left'
  const textX = isLeft ? x - 8 : x + width + 8
  const anchor = isLeft ? 'end' : 'start'
  const label = `${payload.label} · ${payload.value ?? 0}${payload.pct !== null ? ` (${payload.pct}%)` : ''}`
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={payload.color} rx={2} />
      <text
        x={textX} y={y + height / 2} dominantBaseline="middle" textAnchor={anchor}
        fontSize={11} fill="#374151" fontWeight={600}
      >
        {label}
      </text>
    </g>
  )
}

function SankeyLink(props: unknown) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props as {
    sourceX: number; targetX: number; sourceY: number; targetY: number
    sourceControlX: number; targetControlX: number; linkWidth: number
    payload: { source: NodePayload }
  }
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={payload.source?.color ?? '#d1d5db'}
      strokeOpacity={0.3}
      strokeWidth={Math.max(1, linkWidth)}
    />
  )
}

// ── Modal ───────────────────────────────────────────────────────────────────

export default function ProgressModal({
  projectId, reports, onClose,
}: {
  projectId: string
  reports: ReportListItem[]
  onClose: () => void
}) {
  // Comparable reports, newest first (the list already arrives newest-first).
  const comparable = useMemo(() => reports.filter(r => r.hasSnapshot), [reports])

  // Defaults: compare the previous report (baseline) against the latest.
  const [toId, setToId] = useState(comparable[0]?._id ?? '')
  const [fromId, setFromId] = useState(comparable[1]?._id ?? '')
  const [discipline, setDiscipline] = useState('')
  const [data, setData] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fromId || !toId) return
    let alive = true
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ from: fromId, to: toId })
    if (discipline) params.set('discipline', discipline)
    fetch(`/api/projects/${projectId}/report-compare?${params}`)
      .then(async r => {
        const json = await r.json() as CompareData & { error?: string }
        if (!alive) return
        if (json.error) setError(json.error)
        else setData(json)
      })
      .catch(e => { if (alive) setError(String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId, fromId, toId, discipline])

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Aggregate per-status table used when issues can't be matched one-by-one
  // (older reports whose exports carry no ACC issue numbers).
  const aggregate = useMemo(() => {
    if (!data) return []
    const statuses = [...new Set([...Object.keys(data.from.counts), ...Object.keys(data.to.counts)])]
    return statuses
      .map(s => ({
        status: s,
        from: data.from.counts[s] ?? 0,
        to: data.to.counts[s] ?? 0,
      }))
      .sort((a, b) => b.to - a.to)
  }, [data])

  // Build recharts Sankey nodes/links from the flow matrix.
  const sankey = useMemo(() => {
    if (!data || data.matchedCount === 0 || data.flows.length === 0) return null
    const sideSum = (side: 'from' | 'to') => {
      const m = new Map<string, number>()
      for (const f of data.flows) m.set(f[side], (m.get(f[side]) ?? 0) + f.count)
      return m
    }
    const leftCounts = sideSum('from')
    const rightCounts = sideSum('to')
    // Real statuses by descending count, synthetic buckets last.
    const order = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => {
        const synthA = a[0] === NEW_KEY || a[0] === REMOVED_KEY
        const synthB = b[0] === NEW_KEY || b[0] === REMOVED_KEY
        if (synthA !== synthB) return synthA ? 1 : -1
        return b[1] - a[1]
      }).map(([k]) => k)

    const pct = (key: string, count: number, total: number) =>
      key === NEW_KEY || key === REMOVED_KEY || total === 0
        ? null
        : Math.round((count / total) * 1000) / 10

    const nodes: NodePayload[] = []
    const index = new Map<string, number>()
    for (const key of order(leftCounts)) {
      index.set(`L:${key}`, nodes.length)
      nodes.push({ name: `L:${key}`, label: bucketLabel(key), color: bucketColor(key), side: 'left', pct: pct(key, leftCounts.get(key)!, data.from.total) })
    }
    for (const key of order(rightCounts)) {
      index.set(`R:${key}`, nodes.length)
      nodes.push({ name: `R:${key}`, label: bucketLabel(key), color: bucketColor(key), side: 'right', pct: pct(key, rightCounts.get(key)!, data.to.total) })
    }
    const links = data.flows.map(f => ({
      source: index.get(`L:${f.from}`)!,
      target: index.get(`R:${f.to}`)!,
      value: f.count,
    }))
    return { nodes, links }
  }, [data])

  const selectCls = 'text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20 max-w-[240px]'

  const reportOption = (r: ReportListItem) =>
    `${r.createdAt ? fmtDate(r.createdAt) : '—'} · ${r.title}${typeof r.issueCount === 'number' ? ` · ${r.issueCount} issues` : ''}`

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto p-4 md:p-8"
      style={{ background: 'rgba(28,32,52,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#f0f3ff] to-white">
          <div className="w-9 h-9 rounded-lg grid place-items-center text-white" style={{ background: 'linear-gradient(135deg,#1e248c,#44b8d3)' }}>
            <TrendingUp size={17} />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#1e248c] leading-tight">Progress — Issue Status Flow</h1>
            <p className="text-[11px] text-gray-500">How issue statuses moved between two reports</p>
          </div>
          <button onClick={onClose} className="ms-auto w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Baseline</label>
          <select className={selectCls} value={fromId} onChange={e => setFromId(e.target.value)}>
            {comparable.map(r => (
              <option key={r._id} value={r._id} disabled={r._id === toId}>{reportOption(r)}</option>
            ))}
          </select>
          <ArrowLeft size={13} className="text-gray-400 rotate-180" />
          <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Compare to</label>
          <select className={selectCls} value={toId} onChange={e => setToId(e.target.value)}>
            {comparable.map(r => (
              <option key={r._id} value={r._id} disabled={r._id === fromId}>{reportOption(r)}</option>
            ))}
          </select>
          <div className="ms-auto flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Discipline</label>
            <select className={selectCls} value={discipline} onChange={e => setDiscipline(e.target.value)}>
              <option value="">All disciplines</option>
              {(data?.disciplines ?? []).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

          {!error && data && (
            <>
              {/* Totals header: baseline → target */}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-3 px-1">
                <div>
                  <p className="font-semibold text-[#1e248c]">{fmtDate(data.from.createdAt)}</p>
                  <p>{data.from.total} issues</p>
                </div>
                <ArrowLeft size={15} className="text-gray-300 rotate-180" />
                <div className="text-right">
                  <p className="font-semibold text-[#1e248c]">{fmtDate(data.to.createdAt)}</p>
                  <p>{data.to.total} issues</p>
                </div>
              </div>

              {loading ? (
                <div className="h-[420px] grid place-items-center text-gray-400"><Loader2 className="animate-spin" /></div>
              ) : sankey ? (
                <div className="flex justify-center">
                  <Sankey
                    width={780}
                    height={Math.max(320, 40 * Math.max(
                      sankey.nodes.filter(n => n.side === 'left').length,
                      sankey.nodes.filter(n => n.side === 'right').length,
                    ) + 80)}
                    data={sankey}
                    node={<SankeyNode />}
                    link={<SankeyLink />}
                    nodeWidth={14}
                    nodePadding={28}
                    margin={{ top: 10, right: 170, bottom: 10, left: 170 }}
                  />
                </div>
              ) : aggregate.length > 0 ? (
                // No issue-level match (the baseline export predates ACC issue
                // numbers) → compare status totals instead of flows.
                <div>
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                    These reports can&apos;t be matched issue-by-issue (the baseline report&apos;s export
                    has no ACC issue numbers), so totals are compared per status instead.
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left py-2 font-medium">Status</th>
                        <th className="text-right py-2 font-medium">{fmtDate(data.from.createdAt)}</th>
                        <th className="text-right py-2 font-medium">{fmtDate(data.to.createdAt)}</th>
                        <th className="text-right py-2 font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregate.map(row => {
                        const delta = row.to - row.from
                        return (
                          <tr key={row.status} className="border-b border-gray-50 last:border-0">
                            <td className="py-2">
                              <span className="inline-flex items-center gap-2 font-medium text-gray-700">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: bucketColor(row.status) }} />
                                {bucketLabel(row.status)}
                              </span>
                            </td>
                            <td className="text-right py-2 text-gray-600">{row.from}</td>
                            <td className="text-right py-2 text-gray-600">{row.to}</td>
                            <td className={`text-right py-2 font-semibold ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                              {delta > 0 ? `+${delta}` : delta}
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="border-t border-gray-200">
                        <td className="py-2 font-semibold text-gray-700">Total</td>
                        <td className="text-right py-2 font-semibold text-gray-700">{data.from.total}</td>
                        <td className="text-right py-2 font-semibold text-gray-700">{data.to.total}</td>
                        <td className={`text-right py-2 font-semibold ${data.to.total - data.from.total > 0 ? 'text-red-500' : data.to.total - data.from.total < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {data.to.total - data.from.total > 0 ? `+${data.to.total - data.from.total}` : data.to.total - data.from.total}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-[200px] grid place-items-center text-sm text-gray-400">
                  No issues to compare{discipline ? ' for this discipline' : ''}.
                </div>
              )}
            </>
          )}

          {!error && !data && (
            <div className="h-[300px] grid place-items-center text-gray-400"><Loader2 className="animate-spin" /></div>
          )}
        </div>
      </div>
    </div>
  )
}
