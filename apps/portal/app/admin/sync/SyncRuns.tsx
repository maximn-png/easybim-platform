'use client'

// Sync Health client: the runs table + the Sync Now trigger.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { fmtDateTime } from '@/lib/dates'

export interface SyncRunRow {
  id: string
  startedAt: number
  durationMs: number
  trigger: 'cron' | 'manual'
  triggeredBy: string | null
  ok: boolean
  synced: number
  issueStatsUpdated: number
  errors: string[]
  fatal: string | null
}

const NAVY = '#1e248c'
const fmtDur = (ms: number) => ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${Math.round(ms / 1000)}s`

function StatusChip({ run }: { run: SyncRunRow }) {
  if (run.fatal) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">Failed</span>
  if (run.ok) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-600">OK</span>
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600">{run.errors.length} error{run.errors.length > 1 ? 's' : ''}</span>
}

export default function SyncRuns({ runs }: { runs: SyncRunRow[] }) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  async function syncNow() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/sync/trigger', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setResult({
          ok: true,
          text: `Synced ${data?.synced ?? '?'} projects, ${data?.issueStatsUpdated ?? 0} issue-stat updates, ${data?.errors?.length ?? 0} errors in ${fmtDur(data?.durationMs ?? 0)}`,
        })
      } else {
        setResult({ ok: false, text: data?.error ?? `Trigger failed (${res.status})` })
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSyncing(false)
      router.refresh()
    }
  }

  return (
    <div className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold" style={{ color: NAVY }}>Recent runs</h2>
        <div className="flex items-center gap-2">
          {result && (
            <span className={`text-[11px] ${result.ok ? 'text-green-600' : 'text-red-600'}`}>{result.text}</span>
          )}
          <button
            onClick={() => void syncNow()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors hover:bg-white disabled:opacity-60"
            style={{ background: 'rgba(30,36,140,0.06)', borderColor: 'rgba(30,36,140,0.20)', color: NAVY }}
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} style={{ color: '#44b8d3' }} />}
            {syncing ? 'Syncing… (can take a few minutes)' : 'Sync Now'}
          </button>
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: '#6b7280' }}>
          No runs recorded yet — they appear after the next hourly sync (or a Sync Now).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200/70 text-left">
                <th className="px-2 py-1.5 font-semibold text-gray-500">Started</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500">Trigger</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500 text-right">Duration</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500 text-right">Projects</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500 text-right">Issue stats</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const expandable = r.errors.length > 0 || !!r.fatal
                const isOpen = open[r.id]
                return (
                  <FragmentRow
                    key={r.id}
                    run={r}
                    expandable={expandable}
                    isOpen={!!isOpen}
                    toggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FragmentRow({
  run, expandable, isOpen, toggle,
}: { run: SyncRunRow; expandable: boolean; isOpen: boolean; toggle: () => void }) {
  return (
    <>
      <tr
        className={`border-b border-gray-100/80 ${expandable ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}
        onClick={expandable ? toggle : undefined}
      >
        <td className="px-2 py-1.5 whitespace-nowrap text-gray-700">
          {expandable && (isOpen ? <ChevronDown size={11} className="inline mr-1 text-gray-400" /> : <ChevronRight size={11} className="inline mr-1 text-gray-400" />)}
          {fmtDateTime(run.startedAt)}
        </td>
        <td className="px-2 py-1.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${run.trigger === 'cron' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
            {run.trigger}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right text-gray-600 tabular-nums">{fmtDur(run.durationMs)}</td>
        <td className="px-2 py-1.5 text-right text-gray-800 tabular-nums">{run.synced}</td>
        <td className="px-2 py-1.5 text-right text-gray-600 tabular-nums">{run.issueStatsUpdated}</td>
        <td className="px-2 py-1.5"><StatusChip run={run} /></td>
      </tr>
      {expandable && isOpen && (
        <tr className="border-b border-gray-100/80">
          <td colSpan={6} className="px-4 py-2 bg-red-50/30">
            {run.fatal && <p className="text-[11px] font-semibold text-red-700 mb-1">Fatal: {run.fatal}</p>}
            <ul className="list-disc pl-4 space-y-0.5">
              {run.errors.map((e, i) => (
                <li key={i} className="text-[11px] text-gray-700">{e}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}
