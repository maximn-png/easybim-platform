'use client'

// Agent runs feed + 30-day token/cost aggregation. Filtering is in-memory over
// the 200 preloaded rows.
import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { estimateCostUSD } from '@/lib/aiCost'

export interface AgentRunRow {
  id: string
  agentKey: string
  trigger: string
  pass: string
  status: string
  summary: string
  error: string | null
  inputTokens: number
  outputTokens: number
  startedAt: number
  finishedAt: number | null
}

export interface DailyStat {
  agentKey: string
  day: string
  inputTokens: number
  outputTokens: number
  runs: number
  errors: number
}

const NAVY = '#1e248c'
const STUCK_MS = 30 * 60_000

const AGENT_EMOJI: Record<string, string> = { peacock: '🦚', squirrel: '🐿️', dog: '🐕' }
const agentLabel = (key: string) => `${AGENT_EMOJI[key] ?? '🤖'} ${key}`

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)
const fmtUSD = (n: number) => `$${n.toFixed(2)}`
const fmtDur = (run: AgentRunRow) =>
  run.finishedAt ? `${Math.max(1, Math.round((run.finishedAt - run.startedAt) / 1000))}s` : '—'

function statusChip(status: string) {
  const map: Record<string, string> = {
    done: 'bg-green-50 text-green-600',
    error: 'bg-red-50 text-red-600',
    running: 'bg-blue-50 text-blue-600',
  }
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>
}

export default function AgentRuns({ runs, stats }: { runs: AgentRunRow[]; stats: DailyStat[] }) {
  const [agent, setAgent] = useState('all')
  const [status, setStatus] = useState('all')
  const [trigger, setTrigger] = useState('all')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const agents = useMemo(() => [...new Set(runs.map((r) => r.agentKey))].sort(), [runs])
  const stuck = useMemo(
    () => runs.filter((r) => r.status === 'running' && r.startedAt < Date.now() - STUCK_MS),
    [runs],
  )
  const visible = runs.filter((r) =>
    (agent === 'all' || r.agentKey === agent) &&
    (status === 'all' || r.status === status) &&
    (trigger === 'all' || r.trigger === trigger))

  // Cost aggregation from the 30d daily stats.
  const perAgent = useMemo(() => {
    const map = new Map<string, { input: number; output: number; runs: number; errors: number }>()
    for (const s of stats) {
      const slot = map.get(s.agentKey) ?? { input: 0, output: 0, runs: 0, errors: 0 }
      slot.input += s.inputTokens; slot.output += s.outputTokens
      slot.runs += s.runs; slot.errors += s.errors
      map.set(s.agentKey, slot)
    }
    return [...map.entries()].sort((a, b) => estimateCostUSD(b[1].input, b[1].output) - estimateCostUSD(a[1].input, a[1].output))
  }, [stats])
  const totals = perAgent.reduce(
    (t, [, v]) => ({ input: t.input + v.input, output: t.output + v.output, runs: t.runs + v.runs }),
    { input: 0, output: 0, runs: 0 },
  )
  const maxDayTokens = Math.max(1, ...stats.map((s) => s.inputTokens + s.outputTokens))

  const selectClass = 'px-2 py-1 rounded-lg border text-xs bg-white/80'
  const selectStyle = { borderColor: 'rgba(30,36,140,0.15)', color: NAVY }

  return (
    <div className="flex flex-col gap-4">
      {stuck.length > 0 && (
        <div className="px-4 py-3 rounded-xl border text-sm flex items-start gap-2"
          style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">{stuck.length} run{stuck.length > 1 ? 's' : ''} stuck in &quot;running&quot;:</span>{' '}
            {stuck.map((r) => `${agentLabel(r.agentKey)}/${r.pass} (started ${new Date(r.startedAt).toLocaleString()})`).join(', ')}
            <span className="block text-[11px] mt-0.5">Nothing reaps abandoned runs — these likely died mid-flight.</span>
          </div>
        </div>
      )}

      {/* Cost summary */}
      <div className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-bold mb-2" style={{ color: NAVY }}>AI usage — last 30 days</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[
            { label: 'Estimated cost', value: fmtUSD(estimateCostUSD(totals.input, totals.output)) },
            { label: 'Input tokens', value: fmtTokens(totals.input) },
            { label: 'Output tokens', value: fmtTokens(totals.output) },
            { label: 'Runs', value: String(totals.runs) },
          ].map((t) => (
            <div key={t.label}>
              <div className="text-[11px]" style={{ color: '#6b7280' }}>{t.label}</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: NAVY }}>{t.value}</div>
            </div>
          ))}
        </div>
        <table className="w-full text-[12px] max-w-[700px]">
          <thead>
            <tr className="border-b border-gray-200/70 text-left">
              <th className="px-2 py-1 font-semibold text-gray-500">Agent</th>
              <th className="px-2 py-1 font-semibold text-gray-500 text-right">Runs</th>
              <th className="px-2 py-1 font-semibold text-gray-500 text-right">Errors</th>
              <th className="px-2 py-1 font-semibold text-gray-500 text-right">In</th>
              <th className="px-2 py-1 font-semibold text-gray-500 text-right">Out</th>
              <th className="px-2 py-1 font-semibold text-gray-500 text-right">Cost (30d)</th>
            </tr>
          </thead>
          <tbody>
            {perAgent.map(([key, v]) => (
              <tr key={key} className="border-b border-gray-100/80">
                <td className="px-2 py-1 font-medium text-gray-800">{agentLabel(key)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-gray-600">{v.runs}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${v.errors ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{v.errors}</td>
                <td className="px-2 py-1 text-right tabular-nums text-gray-600">{fmtTokens(v.input)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-gray-600">{fmtTokens(v.output)}</td>
                <td className="px-2 py-1 text-right tabular-nums font-semibold" style={{ color: NAVY }}>
                  {fmtUSD(estimateCostUSD(v.input, v.output))}
                </td>
              </tr>
            ))}
            {perAgent.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">No runs in the last 30 days</td></tr>
            )}
          </tbody>
        </table>

        {/* Daily token bars */}
        {stats.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] mb-1" style={{ color: '#6b7280' }}>Tokens per day (all agents)</div>
            <div className="flex items-end gap-[2px] h-16">
              {Object.entries(
                stats.reduce<Record<string, number>>((acc, s) => {
                  acc[s.day] = (acc[s.day] ?? 0) + s.inputTokens + s.outputTokens
                  return acc
                }, {}),
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, tokens]) => (
                  <div
                    key={day}
                    title={`${day}: ${fmtTokens(tokens)} tokens`}
                    className="flex-1 rounded-t"
                    style={{ height: `${Math.max(4, (tokens / maxDayTokens) * 100)}%`, background: 'rgba(30,36,140,0.45)' }}
                  />
                ))}
            </div>
          </div>
        )}
        <p className="text-[10px] mt-2" style={{ color: '#9ca3af' }}>
          Cost estimated at claude-opus-4-8 rates ($5/M input, $25/M output) — the model all agents currently use.
        </p>
      </div>

      {/* Runs feed */}
      <div className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-bold" style={{ color: NAVY }}>Recent runs <span className="font-normal text-gray-400">({visible.length} of {runs.length})</span></h2>
          <div className="flex items-center gap-2">
            <select value={agent} onChange={(e) => setAgent(e.target.value)} className={selectClass} style={selectStyle}>
              <option value="all">All agents</option>
              {agents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass} style={selectStyle}>
              <option value="all">All statuses</option>
              {['done', 'error', 'running'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className={selectClass} style={selectStyle}>
              <option value="all">All triggers</option>
              {['cron', 'webhook', 'manual'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200/70 text-left">
                <th className="px-2 py-1.5 font-semibold text-gray-500">Started</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500">Agent / pass</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500">Trigger</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500">Status</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500 text-right">Duration</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500 text-right">Tokens</th>
                <th className="px-2 py-1.5 font-semibold text-gray-500">Summary</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const expandable = !!r.error
                const isOpen = open[r.id]
                return (
                  <RunRow key={r.id} run={r} expandable={expandable} isOpen={!!isOpen}
                    toggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} />
                )
              })}
              {visible.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-6 text-center text-gray-400">No runs match the filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function RunRow({
  run, expandable, isOpen, toggle,
}: { run: AgentRunRow; expandable: boolean; isOpen: boolean; toggle: () => void }) {
  return (
    <>
      <tr
        className={`border-b border-gray-100/80 ${expandable ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}
        onClick={expandable ? toggle : undefined}
      >
        <td className="px-2 py-1.5 whitespace-nowrap text-gray-700">
          {expandable && (isOpen ? <ChevronDown size={11} className="inline mr-1 text-gray-400" /> : <ChevronRight size={11} className="inline mr-1 text-gray-400" />)}
          {new Date(run.startedAt).toLocaleString()}
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap font-medium text-gray-800">{agentLabel(run.agentKey)}<span className="text-gray-400"> / {run.pass}</span></td>
        <td className="px-2 py-1.5">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{run.trigger}</span>
        </td>
        <td className="px-2 py-1.5">{statusChip(run.status)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{fmtDur(run)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{fmtTokens(run.inputTokens + run.outputTokens)}</td>
        <td className="px-2 py-1.5 text-gray-600 max-w-[340px] truncate" title={run.summary}>{run.summary || '—'}</td>
      </tr>
      {expandable && isOpen && (
        <tr className="border-b border-gray-100/80">
          <td colSpan={7} className="px-4 py-2 bg-red-50/30 text-[11px] text-red-700 whitespace-pre-wrap">{run.error}</td>
        </tr>
      )}
    </>
  )
}
