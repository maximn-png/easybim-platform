'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity, BarChart3, CheckCircle2, ChevronRight, ClipboardList, Clock, FileText, Sparkles, TrendingDown, Users,
} from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import ChatShell from './ChatShell'
import PeacockChatDock from './PeacockChatDock'
import CompletedProjects from './CompletedProjects'
import ClientAnalytics from './ClientAnalytics'
import { ACCENT, ACCENT_BG, CARD } from './postMeta'
import {
  ClientsDTO, CompletedDTO, DEPT_COLOR, FLAG_LABEL, FLAG_TONE_COLOR, OUTCOME_COLOR,
  VERDICT_COLOR, VERDICT_LABEL, fmtDate, hrs, pctText, shekel,
} from './squirrelMeta'

// Squirrel's landing page — the same shape as Peacock's: cards that summarise,
// each opening its own view, with the chat docked beside them rather than on a
// separate page. The chat is the thing that answers the follow-up a card
// provokes ("why did that one go over?"), so it should be reachable without
// losing the card that provoked it.

type View = 'dashboard' | 'completed' | 'clients' | 'chat'

interface RunDTO {
  id: string
  pass: string
  trigger: string
  status: string
  summary: string | null
  error: string | null
  startedAt: string
}

export default function SquirrelDashboard({
  agentKey, agentName, description, presentation: p,
}: {
  agentKey: string; agentName: string; description: string; presentation: AgentPresentation
}) {
  const [view, setView] = useState<View>('dashboard')
  const [dockOpen, setDockOpen] = useState(false)
  const [completed, setCompleted] = useState<CompletedDTO | null>(null)
  const [clients, setClients] = useState<ClientsDTO | null>(null)
  const [runs, setRuns] = useState<RunDTO[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Independent cards: a Monday hiccup on the projects side shouldn't blank the
    // client numbers, which come from Mongo alone.
    const [c, cl, r] = await Promise.allSettled([
      fetch(`/api/dashboard/${agentKey}/completed`, { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/dashboard/${agentKey}/clients`, { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/dashboard/${agentKey}/runs`, { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)),
    ])
    if (c.status === 'fulfilled' && c.value?.totals) setCompleted(c.value)
    if (cl.status === 'fulfilled' && cl.value?.totals) setClients(cl.value)
    if (r.status === 'fulfilled' && r.value?.runs) setRuns(r.value.runs)
    setLoading(false)
  }, [agentKey])

  useEffect(() => { load() }, [load])

  if (view === 'completed') return <CompletedProjects agentKey={agentKey} onBack={() => setView('dashboard')} />
  if (view === 'clients') return <ClientAnalytics agentKey={agentKey} onBack={() => setView('dashboard')} />

  if (view === 'chat') {
    return (
      <div>
        <ChatShell agentKey={agentKey} agentName={agentName} description={description} presentation={p} />
        <button
          onClick={() => setView('dashboard')}
          className="fixed bottom-5 right-5 z-50 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg cursor-pointer"
          style={{ background: ACCENT, border: 'none', fontFamily: 'inherit' }}
        >
          ← Dashboard
        </button>
      </div>
    )
  }

  const ct = completed?.totals
  const clt = clients?.totals
  const dash = (v: string | number | null | undefined) => (loading && v == null ? '…' : v ?? '—')

  const stats = [
    {
      label: 'Open quotes',
      value: dash(clt?.open),
      note: 'waiting on a client answer',
      icon: <FileText size={16} />,
      onClick: () => setView('clients'),
    },
    {
      label: 'Win rate',
      value: clt?.winRate == null ? dash(null) : `${Math.round(clt.winRate * 100)}%`,
      note: clt ? `${clt.won} won · ${clt.lost} declined` : 'across every quote',
      icon: <CheckCircle2 size={16} />,
      onClick: () => setView('clients'),
    },
    {
      label: 'Completed projects',
      value: dash(ct?.projects),
      note: ct ? `${ct.measured} with hours + budget` : 'marked DONE on MA-004',
      icon: <ClipboardList size={16} />,
      onClick: () => setView('completed'),
    },
    {
      label: 'Hours vs banked',
      value: ct ? pctText(ct.pct) : dash(null),
      valueColor: ct ? VERDICT_COLOR[ct.verdict] : undefined,
      note: ct ? VERDICT_LABEL[ct.verdict].label : 'on completed work',
      icon: <Clock size={16} />,
      onClick: () => setView('completed'),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', color: '#1f2430', background: 'linear-gradient(135deg,#f0f3ff 0%,#e7eefe 100%)' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 32px 60px' }}>
        <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <Link href="/" className="hover:text-[#1e248c]">Agent Kingdom</Link>
              <span aria-hidden>›</span>
              <span className="text-[#1e248c] font-medium">{agentName}</span>
            </div>
            <h1 className="text-3xl font-bold text-[#1e248c]">{agentName}</h1>
            <p className="text-gray-500 text-sm mt-1">{p.tagline} — quotes in, projects out, and how both went.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('clients')} className={PILL}><Users size={13} /> Clients</button>
            <button onClick={() => setView('completed')} className={PILL}><BarChart3 size={13} /> Completed</button>
            <button onClick={() => setDockOpen((v) => !v)} className={dockOpen ? PILL : PILL_PRIMARY}>
              <Sparkles size={13} /> {dockOpen ? 'Hide chat' : `Ask ${agentName}`}
            </button>
          </div>
        </header>

        <div
          className="grid items-start"
          style={{ gridTemplateColumns: dockOpen ? 'minmax(0,1fr) 400px' : 'minmax(0,1fr)', gap: dockOpen ? 20 : 0 }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: dockOpen ? 'repeat(2,1fr)' : 'repeat(4,1fr)' }}>
              {stats.map((s) => <StatTile key={s.label} {...s} />)}
            </div>

            <div className="grid gap-4 items-start" style={{ gridTemplateColumns: dockOpen ? 'minmax(0,1fr)' : '1fr 1fr' }}>
              <CompletedCard data={completed} loading={loading} onOpen={() => setView('completed')} />
              <ClientsCard data={clients} loading={loading} onOpen={() => setView('clients')} />
            </div>

            <div style={{ ...CARD, padding: '20px 24px 12px', marginTop: 16 }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Activity size={14} style={{ color: ACCENT }} />
                <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">Agent Activity</h3>
              </div>
              {runs.length === 0 && <p className="text-[13px] text-gray-400 py-3">No runs yet.</p>}
              {runs.slice(0, 5).map((r) => (
                <div key={r.id} className="flex gap-3" style={{ padding: '11px 0', borderTop: '1px solid #eef1f8' }}>
                  <span className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 8, flex: 'none', background: r.status === 'error' ? '#fdecec' : ACCENT_BG, color: r.status === 'error' ? '#e5484d' : ACCENT }}>
                    <Sparkles size={13} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#3a3f4d', lineHeight: 1.45 }}>
                      {r.pass}/{r.trigger} — {(r.summary ?? r.error ?? r.status).slice(0, 110)}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{fmtDateTime(r.startedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {dockOpen && (
            <PeacockChatDock
              agentKey={agentKey}
              agentName={agentName}
              presentation={p}
              onClose={() => setDockOpen(false)}
              onExpand={() => { setDockOpen(false); setView('chat') }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const PILL = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer'
const PILL_PRIMARY = 'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1e248c] text-white hover:bg-[#3d47b8] transition-colors cursor-pointer border border-[#1e248c]'

function StatTile({
  label, value, note, icon, valueColor, onClick,
}: {
  label: string; value: string | number; note: string; icon: React.ReactNode; valueColor?: string; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start justify-between text-left cursor-pointer hover:bg-blue-50/40 transition-colors"
      style={{ ...CARD, padding: '14px 18px', fontFamily: 'inherit' }}
    >
      <div>
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="text-2xl font-bold mt-1" style={{ letterSpacing: '-.02em', color: valueColor ?? '#1e248c' }}>{value}</div>
        <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-0.5">{note}<ChevronRight size={11} /></div>
      </div>
      <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: ACCENT_BG, color: ACCENT }}>{icon}</span>
    </button>
  )
}

// ── the two cards ──────────────────────────────────────────────────────────

/**
 * Completed Projects, summarised: how the finished work landed, and how each
 * department did across all of it. The detail (per type, per project) is one
 * click away — this card's job is to say whether anything needs looking at.
 */
function CompletedCard({ data, loading, onOpen }: { data: CompletedDTO | null; loading: boolean; onOpen: () => void }) {
  const top = data?.byType.slice().sort((a, b) => b.measured - a.measured || b.projects - a.projects).slice(0, 4) ?? []
  return (
    <CardShell
      title="Completed Projects"
      subtitle="Hours banked vs spent on everything marked DONE, by סוג פרויקט"
      onOpen={onOpen}
      empty={!data && !loading ? 'Couldn’t reach MA-004 — open the card to retry.' : null}
      loading={loading && !data}
    >
      {data && (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-3">
            {(['good', 'ok', 'over', 'unknown'] as const).map((v) => (
              <span key={v} className="flex items-center gap-1.5 text-[12px]" title={VERDICT_LABEL[v].hint}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: VERDICT_COLOR[v], flex: 'none' }} />
                <span className="text-gray-500">{VERDICT_LABEL[v].label}</span>
                <span className="font-bold text-[#1e248c]">{data.totals.verdictCounts[v]}</span>
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 mb-3">
            {data.byDepartment.map((d) => (
              <div key={d.key}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-[12px] text-gray-600">
                    <span style={{ width: 8, height: 8, borderRadius: 2.5, background: DEPT_COLOR[d.key], flex: 'none' }} />
                    {d.label}
                  </span>
                  <span className="text-[11.5px] text-gray-400">
                    {hrs(d.spent)} / {hrs(d.bank)}{' '}
                    <strong style={{ color: VERDICT_COLOR[d.verdict] }}>{pctText(d.pct)}</strong>
                  </span>
                </div>
                <MiniMeter spent={d.spent} bank={d.bank} color={DEPT_COLOR[d.key]} />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {top.map((g) => (
              <span key={g.projectType} className="text-[11px]" style={{ padding: '3px 9px', borderRadius: 999, background: '#f5f7fc', color: '#5b6270' }}>
                Type {g.projectType} · {g.projects}{' '}
                <strong style={{ color: VERDICT_COLOR[g.verdict] }}>{pctText(g.pct)}</strong>
              </span>
            ))}
          </div>
        </>
      )}
    </CardShell>
  )
}

/** Analytics by Client, summarised: who needs a call, and the overall win split. */
function ClientsCard({ data, loading, onOpen }: { data: ClientsDTO | null; loading: boolean; onOpen: () => void }) {
  const attention = data?.attention.slice(0, 4) ?? []
  const t = data?.totals
  const total = t ? Math.max(t.won + t.lost + t.open, 1) : 1
  return (
    <CardShell
      title="Analytics by Client"
      subtitle="Quotes asked for, won and declined — and who has gone quiet"
      onOpen={onOpen}
      empty={!data && !loading ? 'Couldn’t load the quote index — open the card to retry.' : null}
      loading={loading && !data}
    >
      {data && t && (
        <>
          <div className="flex" style={{ height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, marginBottom: 10 }}>
            <span title={`${t.won} approved`} style={{ width: `${(t.won / total) * 100}%`, background: OUTCOME_COLOR.won }} />
            <span title={`${t.lost} declined`} style={{ width: `${(t.lost / total) * 100}%`, background: OUTCOME_COLOR.lost }} />
            <span title={`${t.open} open`} style={{ width: `${(t.open / total) * 100}%`, background: OUTCOME_COLOR.open }} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-3 text-[12px]">
            <Legend color={OUTCOME_COLOR.won} label="Approved" value={t.won} sub={shekel(t.valueWon)} />
            <Legend color={OUTCOME_COLOR.lost} label="Declined" value={t.lost} sub={shekel(t.valueLost)} />
            <Legend color={OUTCOME_COLOR.open} label="Open" value={t.open} />
          </div>

          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Worth a call · {data.attention.length}
          </div>
          {attention.length === 0 && <p className="text-[12.5px] text-gray-400 m-0 py-2">Nothing flagged — every client is active and winning work.</p>}
          {attention.map((r) => (
            <div key={r.party} className="flex items-center gap-2" style={{ padding: '7px 0', borderTop: '1px solid #f4f6fb' }}>
              {r.flags.includes('losingStreak') || r.flags.includes('allDeclined')
                ? <TrendingDown size={12} style={{ color: FLAG_TONE_COLOR.bad, flex: 'none' }} />
                : <Clock size={12} style={{ color: FLAG_TONE_COLOR.warn, flex: 'none' }} />}
              <span dir="auto" className="text-[12.5px] text-[#2b2f3a]" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.party}
              </span>
              <span className="text-[11px] text-gray-400" style={{ flex: 'none' }}>
                {r.flags.filter((f) => FLAG_LABEL[f].tone !== 'good').map((f) => FLAG_LABEL[f].label).join(' · ')} · last {fmtDate(r.lastSent)}
              </span>
            </div>
          ))}
        </>
      )}
    </CardShell>
  )
}

function Legend({ color, label, value, sub }: { color: string; label: string; value: number; sub?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: 'none' }} />
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-[#1e248c]">{value}</span>
      {sub && <span className="text-gray-400">{sub}</span>}
    </span>
  )
}

function MiniMeter({ spent, bank, color }: { spent: number; bank: number | null; color: string }) {
  if (!bank || bank <= 0) return <div style={{ height: 6, borderRadius: 3, background: '#f1f3f9' }} />
  const ceiling = bank * (300 / 225)
  const scale = Math.max(bank, spent, ceiling)
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: '#eef1f8', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, width: `${(bank / scale) * 100}%`, background: `${color}26` }} />
      <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (spent / scale) * 100)}%`, background: spent > ceiling ? VERDICT_COLOR.over : color, borderRadius: 3 }} />
      <div style={{ position: 'absolute', top: -1, bottom: -1, left: `${(ceiling / scale) * 100}%`, width: 2, background: '#fff', opacity: 0.9 }} />
    </div>
  )
}

function CardShell({
  title, subtitle, onOpen, children, empty, loading,
}: {
  title: string; subtitle: string; onOpen: () => void; children: React.ReactNode; empty: string | null; loading: boolean
}) {
  return (
    <div style={{ ...CARD, padding: '20px 24px' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">{title}</h3>
          <p className="text-[12px] text-gray-400 mt-0.5 mb-0" dir="auto">{subtitle}</p>
        </div>
        <button onClick={onOpen} className="cursor-pointer text-xs font-semibold shrink-0"
          style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', color: ACCENT }}>
          Open →
        </button>
      </div>
      {loading && <p className="text-[13px] text-gray-400 py-4 m-0">Loading…</p>}
      {empty && <p className="text-[13px] text-gray-400 py-4 m-0">{empty}</p>}
      {children}
    </div>
  )
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
