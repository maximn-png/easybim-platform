'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, RefreshCw, Clock, Zap, Webhook, Hand } from 'lucide-react'

interface Run {
  id: string
  pass: string
  trigger: string
  status: string
  summary: string | null
  error: string | null
  context: Record<string, unknown> | null
  inputTokens: number | null
  outputTokens: number | null
  startedAt: string
  finishedAt: string | null
}

interface Message {
  id: string
  role: string
  content: string
  toolName: string | null
  createdAt: string | null
}

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  running: { bg: '#fef3c7', color: '#b45309', label: 'Running' },
  done: { bg: '#dcfce7', color: '#15803d', label: 'Done' },
  error: { bg: '#fee2e2', color: '#b91c1c', label: 'Error' },
}

const TRIGGER_ICON: Record<string, typeof Zap> = { cron: Clock, webhook: Webhook, manual: Hand }

function fmtTime(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function duration(a: string, b: string | null): string {
  if (!b) return '—'
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export default function RunHistory({ agentKey, accent }: { agentKey: string; accent: string }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, Message[]>>({})

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/runs`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs)
      }
    } catch {
      /* transient — next poll retries */
    } finally {
      setLoaded(true)
    }
  }, [agentKey])

  // Poll every 4s for live status.
  useEffect(() => {
    loadRuns()
    const t = setInterval(loadRuns, 4000)
    return () => clearInterval(t)
  }, [loadRuns])

  async function toggle(runId: string) {
    if (expanded === runId) {
      setExpanded(null)
      return
    }
    setExpanded(runId)
    if (!detail[runId]) {
      const res = await fetch(`/api/dashboard/run/${runId}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setDetail((d) => ({ ...d, [runId]: data.messages }))
      }
    }
  }

  if (!loaded) {
    return <p className="text-sm py-10 text-center" style={{ color: '#9ca3af' }}>Loading runs…</p>
  }
  if (runs.length === 0) {
    return (
      <div className="text-center py-16 rounded-2xl border-2 border-dashed" style={{ borderColor: 'rgba(30,36,140,0.12)' }}>
        <p className="text-sm font-semibold" style={{ color: '#6b7280' }}>No runs yet</p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Runs appear here when the agent runs (cron, webhook, or manual).</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-xs self-end" style={{ color: '#9ca3af' }}>
        <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '3s' }} /> live
      </div>
      {runs.map((run) => {
        const st = STATUS[run.status] ?? STATUS.done
        const TIcon = TRIGGER_ICON[run.trigger] ?? Zap
        const isOpen = expanded === run.id
        return (
          <div key={run.id} className="bg-white/70 backdrop-blur-sm border border-white/90 rounded-xl overflow-hidden shadow-sm">
            <button onClick={() => toggle(run.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/40 transition-colors">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold capitalize" style={{ background: `${accent}14`, color: accent }}>
                {run.pass}
              </span>
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#6b7280' }}>
                <TIcon size={12} /> {run.trigger}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: st.bg, color: st.color }}>
                {st.label}
              </span>
              <span className="text-xs ml-auto" style={{ color: '#9ca3af' }}>{fmtTime(run.startedAt)}</span>
              <span className="text-xs tabular-nums" style={{ color: '#9ca3af' }}>{duration(run.startedAt, run.finishedAt)}</span>
              {(run.inputTokens || run.outputTokens) && (
                <span className="text-xs tabular-nums hidden sm:inline" style={{ color: '#b0b6c0' }}>
                  {(run.inputTokens ?? 0) + (run.outputTokens ?? 0)} tok
                </span>
              )}
              <ChevronDown size={15} className="transition-transform" style={{ color: '#9ca3af', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
            </button>

            {isOpen && (
              <div className="px-4 pb-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                {run.error && (
                  <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: '#fee2e2', color: '#b91c1c' }} dir="auto">
                    {run.error}
                  </div>
                )}
                {run.summary && (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>Summary</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#374151' }} dir="auto">{run.summary}</p>
                  </div>
                )}
                <div className="mt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: '#9ca3af' }}>Thread</p>
                  {!detail[run.id] ? (
                    <p className="text-xs" style={{ color: '#9ca3af' }}>Loading messages…</p>
                  ) : detail[run.id].length === 0 ? (
                    <p className="text-xs" style={{ color: '#9ca3af' }}>No messages.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {detail[run.id].map((m) => (
                        <div key={m.id} className="rounded-lg p-3" style={{ background: m.role === 'user' ? 'rgba(68,184,211,0.08)' : 'rgba(124,58,237,0.06)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: m.role === 'user' ? '#0e7490' : accent }}>
                            {m.role}{m.toolName ? ` · ${m.toolName}` : ''}
                          </p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#374151' }} dir="auto">{m.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
