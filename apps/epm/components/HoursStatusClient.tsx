'use client'

// Admin hours status — compares the TimeEntry collection (portal + imported
// Monday history) against the LIVE Monday timesheet boards, per project, so the
// migration can be audited number-by-number before/after the cut-over.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Row {
  projectNumber: string
  projectName: string
  status: string | null
  isActive: boolean
  budgetHours: number | null
  mondayLive: number | null
  mongoMonday: number
  mongoPortal: number
  mongoTotal: number
  delta: number | null
  sharedMa003With?: string
}
interface Bucket { key: string; name: string; mongoMonday: number; mongoPortal: number; mongoTotal: number }
interface Payload {
  rows: Row[]
  buckets: Bucket[]
  totals?: { mondayLive: number; mongoMonday: number; mongoPortal: number; mongoTotal: number }
  mondayCachedAt?: string
  error?: string
}

type SortKey = 'projectNumber' | 'mondayLive' | 'mongoMonday' | 'mongoPortal' | 'mongoTotal' | 'delta' | 'budgetHours'

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function deltaBadge(delta: number | null) {
  if (delta == null) return <span className="text-gray-300">—</span>
  const abs = Math.abs(delta)
  if (abs <= 0.01) return <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">✓ 0</span>
  const cls = abs <= 5 ? 'text-amber-600' : 'text-red-600'
  return <span className={`font-semibold ${cls}`}>{delta > 0 ? '+' : ''}{fmt(delta)}</span>
}

export default function HoursStatusClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('delta')
  const [sortDesc, setSortDesc] = useState(true)
  const [onlyDiffs, setOnlyDiffs] = useState(false)

  const load = useCallback(async (refresh: boolean) => {
    refresh ? setRefreshing(true) : setLoading(true)
    try {
      const res = await fetch(`/api/admin/hours-status${refresh ? '?refresh=1' : ''}`)
      setData(await res.json())
    } catch (e) {
      setData({ rows: [], buckets: [], error: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load(false) }, [load])

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter(r => !onlyDiffs || (r.delta != null && Math.abs(r.delta) > 0.01))
    const dir = sortDesc ? -1 : 1
    return [...list].sort((a, b) => {
      if (sortKey === 'projectNumber') return dir * a.projectNumber.localeCompare(b.projectNumber)
      const av = sortKey === 'delta' ? Math.abs(a.delta ?? 0) : (a[sortKey] ?? -1)
      const bv = sortKey === 'delta' ? Math.abs(b.delta ?? 0) : (b[sortKey] ?? -1)
      return dir * ((av as number) - (bv as number))
    })
  }, [data, sortKey, sortDesc, onlyDiffs])

  const diffCount = useMemo(
    () => (data?.rows ?? []).filter(r => r.delta != null && Math.abs(r.delta) > 0.01).length,
    [data],
  )

  const th = (key: SortKey, label: string, align = 'text-right') => (
    <th
      className={`px-2 py-1.5 ${align} font-semibold text-gray-500 cursor-pointer select-none whitespace-nowrap hover:text-[#1e248c]`}
      onClick={() => { sortKey === key ? setSortDesc(d => !d) : (setSortKey(key), setSortDesc(true)) }}
    >
      {label}{sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="max-w-[1400px] w-full mx-auto flex-1 min-h-0 flex flex-col">
      {/* Breadcrumb + header */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <Link href="/dashboard" className="hover:text-[#1e248c]">Dashboard</Link>
        <span>/</span>
        <span className="text-[#1e248c] font-medium">Hours Status</span>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h1 className="text-2xl font-bold text-[#1e248c]">Hours Status <span className="text-sm font-medium text-gray-400">(admin)</span></h1>
        <div className="flex items-center gap-2">
          {data?.mondayCachedAt && (
            <span className="text-[11px] text-gray-400">
              Monday snapshot: {new Date(data.mondayCachedAt).toLocaleString()}
            </span>
          )}
          <label className="flex items-center gap-1.5 text-[12px] text-gray-600 px-2.5 py-1 rounded-full bg-white/80 border border-white/90 cursor-pointer">
            <input type="checkbox" checked={onlyDiffs} onChange={e => setOnlyDiffs(e.target.checked)} />
            Only differences ({diffCount})
          </label>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Re-sweeping Monday…' : '↻ Refresh from Monday'}
          </button>
        </div>
      </div>

      {/* KPI cards */}
      {data?.totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[
            { label: 'Monday live (TS boards)', value: data.totals.mondayLive, hint: 'linked projects only' },
            { label: 'Imported from Monday', value: data.totals.mongoMonday, hint: 'TimeEntry source: monday' },
            { label: 'Portal-logged', value: data.totals.mongoPortal, hint: 'My Space entries' },
            { label: 'Total in database', value: data.totals.mongoTotal, hint: 'all sources' },
          ].map(k => (
            <div key={k.label} className="glass-card rounded-2xl px-4 py-3">
              <div className="text-[11px] font-medium text-gray-500">{k.label}</div>
              <div className="text-xl font-bold text-[#1e248c] tabular-nums">{fmt(k.value)}h</div>
              <div className="text-[10px] text-gray-400">{k.hint}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="glass-card rounded-2xl p-8 text-center text-[12px] text-gray-500">Loading…</div>
      ) : data?.error ? (
        <div className="glass-card rounded-2xl p-8 text-center text-[12px] text-red-600">{data.error}</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pb-4">
          {/* Per-project comparison */}
          <section className="glass-card rounded-2xl p-4">
            <h2 className="text-sm font-bold text-[#1e248c] mb-2">Per project — database vs Monday</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr className="border-b border-gray-200/70">
                    {th('projectNumber', '#', 'text-left')}
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Project</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Status</th>
                    {th('mondayLive', 'Monday live')}
                    {th('mongoMonday', 'Imported')}
                    {th('mongoPortal', 'Portal')}
                    {th('mongoTotal', 'Total')}
                    {th('delta', 'Δ Imported−Monday')}
                    {th('budgetHours', 'Budget')}
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-500">Used %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const pct = r.budgetHours && r.budgetHours > 0 ? Math.round((r.mongoTotal / r.budgetHours) * 100) : null
                    return (
                      <tr key={r.projectNumber} className="border-b border-gray-100/80 hover:bg-blue-50/40">
                        <td className="px-2 py-1 text-gray-500">{r.projectNumber}</td>
                        <td className="px-2 py-1 font-medium text-gray-800 max-w-[320px] truncate" title={r.projectName}>
                          {r.projectName}
                          {r.sharedMa003With && (
                            <span className="ml-1 text-[10px] text-amber-600" title={`Shares its Monday timesheet link with ${r.sharedMa003With} — Monday cannot split the hours between them`}>
                              ⚠ shared with {r.sharedMa003With}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{r.status ?? '—'}</td>
                        <td className="px-2 py-1 text-right text-gray-600">{fmt(r.mondayLive)}</td>
                        <td className="px-2 py-1 text-right text-gray-800">{fmt(r.mongoMonday)}</td>
                        <td className="px-2 py-1 text-right text-gray-800">{r.mongoPortal ? fmt(r.mongoPortal) : <span className="text-gray-300">0</span>}</td>
                        <td className="px-2 py-1 text-right font-semibold text-[#1e248c]">{fmt(r.mongoTotal)}</td>
                        <td className="px-2 py-1 text-right">{deltaBadge(r.delta)}</td>
                        <td className="px-2 py-1 text-right text-gray-500">{fmt(r.budgetHours)}</td>
                        <td className={`px-2 py-1 text-right ${pct != null && pct > 100 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                          {pct != null ? `${pct}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Non-project buckets */}
          {(data?.buckets?.length ?? 0) > 0 && (
            <section className="glass-card rounded-2xl p-4">
              <h2 className="text-sm font-bold text-[#1e248c] mb-1">Non-project hours</h2>
              <p className="text-[11px] text-gray-500 mb-2">
                Internal EasyBIM work and InteriorBIM client codes not yet assigned to a project. Not part of the per-project comparison above.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] tabular-nums max-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-200/70">
                      <th className="px-2 py-1.5 text-left font-semibold text-gray-500">Bucket</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-gray-500">Imported</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-gray-500">Portal</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.buckets.map(b => (
                      <tr key={b.key} className="border-b border-gray-100/80">
                        <td className="px-2 py-1 font-medium text-gray-800">{b.name} <span className="text-[10px] text-gray-400">({b.key})</span></td>
                        <td className="px-2 py-1 text-right text-gray-800">{fmt(b.mongoMonday)}</td>
                        <td className="px-2 py-1 text-right text-gray-800">{b.mongoPortal ? fmt(b.mongoPortal) : <span className="text-gray-300">0</span>}</td>
                        <td className="px-2 py-1 text-right font-semibold text-[#1e248c]">{fmt(b.mongoTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
