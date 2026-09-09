'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Shield, Play, Loader2, Monitor, Plus, X, Check, AlertTriangle, Copy,
} from 'lucide-react'

// Syncguard control for the Project Model — Coordination card.
//
// Opens the coordination model on a workstation, syncs it with central and
// publishes it, replacing 15+ minutes of an engineer babysitting Revit. See
// docs/SYNCGUARD_PLAN.md. This is the Phase 5 card surface: pick a target
// computer, Run Now, watch progress. The full Automation page (run history,
// scrollback console, schedule editor) is deliberately not here.
//
// Licensing follows the TARGET machine's Windows session, never the browser
// click — there is no way to lend your Revit licence to another computer. So the
// picker is the whole story: your own machine ("personal") for Run Now, a shared
// always-on workstation for anything scheduled later.

interface Agent {
  agentId: string
  machineName: string
  kind: 'personal' | 'shared'
  isMine: boolean
  online: boolean
  revitVersions: string[]
  autodeskSignedIn: boolean
  autodeskUser: string | null
  revitRunning: boolean
  openModels: string[]
  busy: boolean
  blockedReason: string | null
}

interface RunStep {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  message: string | null
}

interface Run {
  runId: string
  status: string
  steps: RunStep[]
  log: { at: string; level: string; text: string }[]
  attentionReason: string | null
  durationMs: number | null
}

const LIVE = ['queued', 'claimed', 'running']
const POLL_MS = 2500

const fmtDuration = (ms: number | null) => {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function SyncguardPanel({
  projectId, itemId, modelName, workshared,
}: {
  projectId: string
  itemId: string
  modelName: string
  workshared: boolean
}) {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [target, setTarget] = useState<string>('')
  const [run, setRun] = useState<Run | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [enrolling, setEnrolling] = useState(false)

  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/syncguard/agents')
      const data = await res.json() as { agents?: Agent[] }
      if (!alive.current) return
      const list = data.agents ?? []
      setAgents(list)
      // Default to the caller's own machine — the case that needs no bot account
      // and attributes the sync to a real person in ACC.
      setTarget(prev => prev || (list.find(a => a.isMine && a.online) ?? list.find(a => a.online) ?? list[0])?.agentId || '')
    } catch { if (alive.current) setAgents([]) }
  }, [])

  // Adopt a run already in flight (someone else's, or ours from before a reload)
  // so the card never shows an idle Run Now while Revit is working.
  const loadLatestRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/syncguard/runs?limit=1`)
      const data = await res.json() as { runs?: { runId: string; status: string }[] }
      const latest = data.runs?.[0]
      if (latest && LIVE.includes(latest.status) && alive.current) setRun({
        runId: latest.runId, status: latest.status, steps: [], log: [], attentionReason: null, durationMs: null,
      })
    } catch { /* the card works without history */ }
  }, [projectId])

  useEffect(() => { loadAgents(); loadLatestRun() }, [loadAgents, loadLatestRun])

  // Poll a live run. Stops itself on a terminal status, so a finished run costs
  // nothing; a 7-minute model open is mostly silence, which is expected — the
  // step list is the progress indicator, not the log.
  useEffect(() => {
    if (!run || !LIVE.includes(run.status)) return
    let stop = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/syncguard/runs/${run.runId}`)
        if (!res.ok) return
        const data = await res.json() as Run
        if (stop || !alive.current) return
        setRun(data)
        if (!LIVE.includes(data.status)) loadAgents()   // machine is free again
      } catch { /* transient */ }
    }
    const id = setInterval(tick, POLL_MS)
    tick()
    return () => { stop = true; clearInterval(id) }
  }, [run, projectId, loadAgents])

  async function start() {
    if (!target || starting) return
    setStarting(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/syncguard/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, agentId: target }),
      })
      const data = await res.json() as { runId?: string; error?: string }
      if (!res.ok || !data.runId) { setError(data.error ?? 'Could not start'); return }
      setRun({ runId: data.runId, status: 'queued', steps: [], log: [], attentionReason: null, durationMs: null })
      loadAgents()
    } catch {
      setError('Could not start')
    } finally {
      setStarting(false)
    }
  }

  // Nothing to sync on a non-cloud model — there is no central and no GUIDs to
  // open by. Publish (on the card's own button) still applies.
  if (!workshared) return null

  const chosen = agents?.find(a => a.agentId === target) ?? null
  const live = run && LIVE.includes(run.status)
  const needsAttention = run?.status === 'needs_attention'

  return (
    <div className="shrink-0 rounded-xl border border-[#1e248c]/15 bg-[#f7f9ff] p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1e248c]">
          <Shield size={13} className="text-[#44b8d3]" /> Syncguard
        </span>

        {agents === null ? (
          <span className="text-[10px] text-gray-400">Loading computers…</span>
        ) : agents.length === 0 ? (
          <button
            onClick={() => setEnrolling(true)}
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#1e248c] hover:text-[#44b8d3]"
          >
            <Plus size={12} /> Add this computer
          </button>
        ) : (
          <>
            <select
              value={target}
              onChange={e => e.target.value === '__add' ? setEnrolling(true) : setTarget(e.target.value)}
              disabled={!!live}
              className="text-[11px] max-w-[240px] truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 outline-none focus:border-[#44b8d3] disabled:bg-gray-50"
              title="Which computer opens Revit — its Windows session supplies the licence"
            >
              {agents.map(a => (
                <option key={a.agentId} value={a.agentId} disabled={!!a.blockedReason}>
                  {a.machineName}{a.isMine ? ' (mine)' : ''} · {a.online ? 'Online' : 'Offline'}
                  {a.blockedReason ? ` — ${a.blockedReason}` : ''}
                </option>
              ))}
              <option value="__add">+ Add a computer…</option>
            </select>

            <button
              onClick={start}
              disabled={!!live || starting || !chosen || !!chosen.blockedReason}
              title={chosen?.blockedReason ?? `Opens Revit on ${chosen?.machineName ?? 'the target'} for several minutes`}
              className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold rounded-md px-2.5 py-1 text-white bg-[#1e248c] hover:bg-[#2a31b5] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {live || starting
                ? <><Loader2 size={12} className="animate-spin" /> Running…</>
                : <><Play size={12} /> Sync &amp; Publish</>}
            </button>
          </>
        )}

        {run && !live && !needsAttention && (
          <span className={`text-[9.5px] font-medium rounded-full px-2 py-px border ${
            run.status === 'success' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : run.status === 'warning' ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-red-700 bg-red-50 border-red-200'
          }`}>
            {run.status === 'success' ? 'Synced' : run.status === 'warning' ? 'Synced with warnings' : 'Failed'}
            {fmtDuration(run.durationMs) ? ` · ${fmtDuration(run.durationMs)}` : ''}
          </span>
        )}
      </div>

      {/* This takes over the target desktop — say so before it happens, not after. */}
      {chosen?.isMine && !live && !run && (
        <p className="text-[9.5px] text-gray-500 leading-snug">
          Revit will open on your computer and hold it for several minutes.
        </p>
      )}

      {error && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">{error}</p>
      )}

      {/* needs_attention is not a failure to retry — a human must act first. */}
      {needsAttention && (
        <div className="flex items-start gap-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          <span className="flex-1">
            <b>Action required:</b> {run.attentionReason ?? 'This run needs attention before it can succeed.'}
          </span>
        </div>
      )}

      {(live || run?.steps?.length) ? <StepList steps={run!.steps} /> : null}

      {live && run.log.length > 0 && (
        <p className="text-[9.5px] font-mono text-gray-500 truncate" title={run.log[run.log.length - 1].text}>
          {run.log[run.log.length - 1].text}
        </p>
      )}

      {enrolling && (
        <EnrollDialog
          onClose={() => setEnrolling(false)}
          onDone={() => { setEnrolling(false); loadAgents() }}
        />
      )}
    </div>
  )
}

// Compact progress. The model open is ~95% of a run's wall clock and emits
// nothing while it works, so a step that sits on "running" for minutes is normal,
// not stuck.
function StepList({ steps }: { steps: RunStep[] }) {
  if (!steps.length) return null
  return (
    <ol className="flex flex-col gap-0.5">
      {steps.map(s => (
        <li key={s.key} className="flex items-center gap-1.5 text-[10px]">
          {s.status === 'done' ? <Check size={11} className="text-emerald-600 shrink-0" />
            : s.status === 'running' ? <Loader2 size={11} className="animate-spin text-[#44b8d3] shrink-0" />
            : s.status === 'failed' ? <X size={11} className="text-red-600 shrink-0" />
            : <span className="w-[11px] h-[11px] rounded-full border border-gray-300 shrink-0" />}
          <span className={s.status === 'pending' || s.status === 'skipped' ? 'text-gray-400' : 'text-gray-700'}>
            {s.label}
          </span>
          {s.message && <span className="text-gray-400 truncate">· {s.message}</span>}
        </li>
      ))}
    </ol>
  )
}

// Pairing-code enrollment. The code is the credential, so it is short-lived and
// single-use, and the raw agent token never travels through this dialog — the
// agent mints it by redeeming the code directly.
function EnrollDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<'personal' | 'shared'>('personal')
  const [code, setCode] = useState<string | null>(null)
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'waiting' | 'redeemed' | 'expired' | 'error'>('idle')
  const [machine, setMachine] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  async function mint() {
    setState('waiting'); setCode(null)
    try {
      const res = await fetch('/api/syncguard/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const data = await res.json() as { code?: string; enrollmentId?: string; error?: string }
      if (!data.code || !data.enrollmentId) { setState('error'); return }
      setCode(data.code); setEnrollmentId(data.enrollmentId)
    } catch { setState('error') }
  }

  // Poll until the agent on that machine redeems it.
  useEffect(() => {
    if (state !== 'waiting' || !enrollmentId) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/syncguard/enroll?id=${enrollmentId}`)
        const data = await res.json() as { status?: string; machineName?: string }
        if (!alive.current) return
        if (data.status === 'redeemed') { setMachine(data.machineName ?? null); setState('redeemed'); clearInterval(id) }
        else if (data.status === 'expired' || data.status === 'gone') { setState('expired'); clearInterval(id) }
      } catch { /* transient */ }
    }, 3000)
    return () => clearInterval(id)
  }, [state, enrollmentId])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(28,32,52,0.55)', backdropFilter: 'blur(2px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[460px] bg-white rounded-2xl shadow-2xl border border-[#e8eaff] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-[#f0f3ff] to-white">
          <div className="w-8 h-8 rounded-lg grid place-items-center text-white" style={{ background: 'linear-gradient(135deg,#1e248c,#44b8d3)' }}>
            <Monitor size={16} />
          </div>
          <h2 className="text-[15px] font-bold text-[#1e248c]">Add a computer</h2>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {state === 'redeemed' ? (
            <div className="flex items-start gap-2 text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <Check size={15} className="shrink-0 mt-px" />
              {/* Deliberately not "ready": the agent is enrolled but stays
                  blocked until its first heartbeat reports Revit's Autodesk
                  sign-in, so promising readiness here would be premature. */}
              <span>
                <b>{machine ?? 'That computer'}</b> is connected. It becomes
                selectable once it reports Revit signed in to Autodesk — usually
                within a minute.
              </span>
            </div>
          ) : (
            <>
              <p className="text-[11.5px] text-gray-600 leading-relaxed">
                Syncguard opens Revit on a real computer, so it uses the Autodesk licence
                and sign-in of whoever is logged in <b>on that machine</b> — not yours in
                this browser.
              </p>

              <div className="flex flex-col gap-1.5">
                {([
                  ['personal', 'My own computer', 'Uses your Revit licence and ACC sign-in. Syncs are attributed to you. Available for Run Now.'],
                  ['shared', 'A shared workstation', 'An always-on machine. The only kind a scheduled run can use, since a laptop may be asleep.'],
                ] as const).map(([k, title, why]) => (
                  <label key={k} className={`flex gap-2 items-start rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    kind === k ? 'border-[#44b8d3] bg-[#f7fdff]' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio" name="kind" checked={kind === k} disabled={state === 'waiting'}
                      onChange={() => setKind(k)} className="mt-0.5 accent-[#1e248c]"
                    />
                    <span>
                      <span className="block text-[12px] font-semibold text-[#1e248c]">{title}</span>
                      <span className="block text-[10.5px] text-gray-500 leading-snug">{why}</span>
                    </span>
                  </label>
                ))}
              </div>

              {code ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] text-gray-600">
                    On that computer, open the EasyBIM Syncguard agent and enter this code:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-center text-[20px] font-bold tracking-[0.2em] text-[#1e248c] bg-[#f4f6ff] border border-[#dfe4ff] rounded-lg py-2.5">
                      {code}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                      className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-[#1e248c] hover:border-[#44b8d3]"
                      title="Copy"
                    >
                      {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 inline-flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" /> Waiting for that computer… the code expires in 15 minutes.
                  </p>
                </div>
              ) : (
                <button
                  onClick={mint}
                  disabled={state === 'waiting'}
                  className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-3 py-1.5 text-white bg-[#1e248c] hover:bg-[#2a31b5] disabled:bg-gray-300"
                >
                  {state === 'waiting' ? <><Loader2 size={13} className="animate-spin" /> Generating…</> : 'Get a pairing code'}
                </button>
              )}

              {state === 'expired' && (
                <p className="text-[10.5px] text-amber-700">That code expired or was cancelled — generate a new one.</p>
              )}
              {state === 'error' && (
                <p className="text-[10.5px] text-amber-700">Could not create a pairing code. Try again.</p>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex justify-end">
          <button
            onClick={state === 'redeemed' ? onDone : onClose}
            className="text-[12px] font-semibold text-[#1e248c] hover:text-[#44b8d3] px-3 py-1"
          >
            {state === 'redeemed' ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
