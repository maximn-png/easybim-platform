'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronRight, Clock, Loader2, Mail, FileEdit, Play, Pause, Trash2, Users,
  AlertTriangle, CheckCircle2, ExternalLink, Search,
} from 'lucide-react'
import type { ScheduleDTO } from '@/lib/scheduleTypes'
import { describeFrequency, formatInZone } from '@/lib/scheduleTime'

// Every recurring report across every project — the answer to "what is going
// out, when, and to whom". Editing a schedule's content happens on its own
// project's reports page; here you can pause, run, or delete.

function StatusPill({ s }: { s: ScheduleDTO }) {
  if (!s.active) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"><Pause size={9} /> Paused</span>
  }
  if (s.lastStatus === 'needs-auth') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><AlertTriangle size={9} /> Needs auth</span>
  }
  if (s.lastStatus === 'failed') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600"><AlertTriangle size={9} /> Failed</span>
  }
  if (s.lastStatus === 'ok') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={9} /> Healthy</span>
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e7eefe] text-[#1e248c]"><Clock size={9} /> Scheduled</span>
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warn' }) {
  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
      <span className={`text-2xl font-bold ${tone === 'warn' && value > 0 ? 'text-amber-600' : 'text-[#1e248c]'}`}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

export default function SchedulesAdminClient() {
  const [schedules, setSchedules] = useState<ScheduleDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/report-schedules')
      const data = await res.json() as { schedules?: ScheduleDTO[]; error?: string }
      if (data.error) { setError(data.error); return }
      setSchedules(data.schedules ?? [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schedules.filter(s => {
      if (onlyActive && !s.active) return false
      if (!q) return true
      return [s.name, s.projectName, s.projectNumber, s.ownerName, ...s.recipients]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    })
  }, [schedules, query, onlyActive])

  const activeCount = schedules.filter(s => s.active).length
  const needsAttention = schedules.filter(s => s.active && (s.lastStatus === 'failed' || s.lastStatus === 'needs-auth')).length
  const projectCount = new Set(schedules.map(s => s.projectId)).size

  const toggleActive = async (s: ScheduleDTO) => {
    setBusyId(s._id)
    try {
      await fetch(`/api/projects/${s.projectId}/report-schedules/${s._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !s.active }),
      })
      await load()
    } finally { setBusyId(null) }
  }

  const runNow = async (s: ScheduleDTO) => {
    const verb = s.deliveryMode === 'send' ? 'send this report now' : 'create the Gmail draft now'
    if (!confirm(`Run "${s.name}" — ${verb} to ${s.recipients.length} recipient(s)?`)) return
    setBusyId(s._id); setNotice(null)
    try {
      const res = await fetch(`/api/projects/${s.projectId}/report-schedules/${s._id}`, { method: 'POST' })
      const data = await res.json() as {
        result?: { status: string; error?: string; recipients?: number; issueCount?: number }
        error?: string
      }
      const r = data.result
      if (data.error || !r) setNotice({ id: s._id, text: data.error ?? 'Run failed', ok: false })
      else if (r.status === 'ok') {
        setNotice({
          id: s._id,
          text: s.deliveryMode === 'send'
            ? `Sent to ${r.recipients} recipient(s) · ${r.issueCount} issues`
            : `Draft created · ${r.issueCount} issues`,
          ok: true,
        })
      } else setNotice({ id: s._id, text: r.error ?? r.status, ok: false })
      await load()
    } catch (e) {
      setNotice({ id: s._id, text: String(e), ok: false })
    } finally { setBusyId(null) }
  }

  const remove = async (s: ScheduleDTO) => {
    if (!confirm(`Delete the schedule "${s.name}" on ${s.projectName ?? 'this project'}? Reports already sent are kept.`)) return
    setBusyId(s._id)
    try {
      await fetch(`/api/projects/${s.projectId}/report-schedules/${s._id}`, { method: 'DELETE' })
      await load()
    } finally { setBusyId(null) }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]" style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}>
      <div className="max-w-[1400px] mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Header */}
        <div>
          <nav className="flex items-center gap-1 text-xs text-gray-500 mb-1">
            <Link href="/dashboard" className="hover:text-[#1e248c]">Dashboard</Link>
            <ChevronRight size={12} />
            <span className="text-[#1e248c] font-medium">Report Schedules</span>
          </nav>
          <h1 className="text-3xl font-bold text-[#1e248c]">Report Schedules</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every recurring report across all projects — what goes out, when, and to whom.
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active schedules" value={activeCount} />
          <StatCard label="Total schedules" value={schedules.length} />
          <StatCard label="Projects covered" value={projectCount} />
          <StatCard label="Need attention" value={needsAttention} tone="warn" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 bg-white/40 border border-white/60 rounded-xl px-4 py-3 backdrop-blur-sm flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter by project, report, owner, or recipient…"
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 placeholder:text-gray-400"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} className="accent-[#1e248c]" />
            Active only
          </label>
          <span className="text-xs text-gray-400">{filtered.length} shown</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <Loader2 size={20} className="animate-spin" /><span className="text-sm">Loading schedules…</span>
          </div>
        )}

        {!loading && error && (
          <div className="glass-card rounded-2xl p-6 flex items-center gap-3 text-red-600">
            <AlertTriangle size={18} />
            <div>
              <p className="font-semibold text-sm">Failed to load schedules</p>
              <p className="text-xs text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
            <Clock size={30} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-gray-500">No schedules{schedules.length > 0 ? ' match this filter' : ' yet'}.</p>
            <p className="text-xs mt-1">
              Create one from a project&apos;s <span className="font-medium">Forma Issues Status</span> page →
              Reports → Schedule report.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-500">Project</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Report</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Cadence</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Recipients</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Next run</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Last run</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Owner</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={s._id} className={`border-b border-gray-100 last:border-0 ${i % 2 ? 'bg-blue-50/20' : 'bg-white'} ${s.active ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/dashboard/${s.projectId}/reports`}
                          className="inline-flex items-center gap-1 text-[#1e248c] hover:underline font-medium"
                        >
                          <span dir="rtl">{s.projectName ?? '—'}</span>
                          <ExternalLink size={10} className="opacity-50" />
                        </Link>
                        {s.projectNumber && <p className="text-[10px] text-gray-400 font-mono">{s.projectNumber}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-gray-800">{s.name}</p>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                          {s.deliveryMode === 'send'
                            ? <><Mail size={9} /> auto-send</>
                            : <><FileEdit size={9} /> draft only</>}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{describeFrequency(s.frequency)}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        <span className="inline-flex items-center gap-1 cursor-help" title={s.recipients.join('\n')}>
                          <Users size={11} className="text-gray-400" /> {s.recipients.length}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {s.active ? formatInZone(s.nextRunAt, s.timezone) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {formatInZone(s.lastRunAt, s.timezone)}
                        {s.runCount > 0 && <span className="text-[10px] text-gray-400"> · {s.runCount}×</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{s.ownerName ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill s={s} />
                        {s.lastStatus && s.lastStatus !== 'ok' && s.lastError && (
                          <p className="text-[10px] text-red-400 mt-0.5 max-w-[220px] truncate" title={s.lastError}>{s.lastError}</p>
                        )}
                        {notice?.id === s._id && (
                          <p className={`text-[10px] mt-0.5 ${notice.ok ? 'text-emerald-600' : 'text-red-500'}`}>{notice.text}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {busyId === s._id && <Loader2 size={13} className="animate-spin text-gray-400" />}
                          <button onClick={() => runNow(s)} disabled={busyId === s._id}
                            title="Run now" className="p-1 text-gray-400 hover:text-[#1e248c] disabled:opacity-40">
                            <Play size={13} />
                          </button>
                          <button onClick={() => toggleActive(s)} disabled={busyId === s._id}
                            title={s.active ? 'Pause' : 'Resume'} className="p-1 text-gray-400 hover:text-[#1e248c] disabled:opacity-40">
                            {s.active ? <Pause size={13} /> : <Play size={13} className="text-emerald-500" />}
                          </button>
                          <button onClick={() => remove(s)} disabled={busyId === s._id}
                            title="Delete" className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          Schedules are checked every 15 minutes. Editing a schedule&apos;s content (template, filters, body)
          happens on its project&apos;s reports page.
        </p>
      </div>
    </div>
  )
}
