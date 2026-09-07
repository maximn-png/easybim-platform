'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Minus, Plus, CheckCircle2, CalendarClock, Layers, Eye, Activity, Sparkles, ListChecks,
  BarChart3, ChevronRight, PauseCircle,
} from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import ChatShell from './ChatShell'
import ProjectStatus from './ProjectStatus'
import PostsBoard from './PostsBoard'
import NewsletterIdeas from './NewsletterIdeas'
import PeacockChatDock from './PeacockChatDock'
import PeacockLinkedIn from './PeacockLinkedIn'
import { compact, useAnalytics } from './PeacockAnalytics'
import {
  ACCENT, ACCENT_BG, CARD, ContentPlan, MAX_POSTS_PER_WEEK, OPEN_STATUSES, POST_TYPES,
  PostDTO, PostStatus, STATUS_META, STATUS_ORDER, typeColor,
} from './postMeta'

const TIMELINE_ID = 'posts-timeline'

// EPM-style buttons: quiet white pills, one solid-navy primary. No gradients.
export const PILL = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer'
export const PILL_PRIMARY = 'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1e248c] text-white hover:bg-[#3d47b8] transition-colors cursor-pointer border border-[#1e248c]'

type Counts = Record<PostStatus, number> & { total: number }
interface RunDTO { id: string; pass: string; trigger: string; status: string; summary: string | null; error: string | null; startedAt: string }

/** Dashboard, Project Status, LinkedIn, or the full-page chat workspace. */
type View = 'dashboard' | 'projects' | 'linkedin' | 'chat'

export default function PeacockDashboard({
  agentKey, agentName, description, presentation: p,
}: {
  agentKey: string; agentName: string; description: string; presentation: AgentPresentation
}) {
  const [view, setView] = useState<View>('dashboard')
  // The chat is docked beside the dashboard rather than replacing it, so this
  // is independent of `view` — it stays open across a trip to Project Status.
  const [dockOpen, setDockOpen] = useState(false)
  const [posts, setPosts] = useState<PostDTO[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [runs, setRuns] = useState<RunDTO[]>([])
  // The content plan is persisted (peacock_settings) because the weekly author
  // cron reads it — the stepper used to be local state that governed nothing.
  // null until loaded, so the card never flashes a default that would overwrite
  // the saved value if you clicked before the fetch landed.
  const [plan, setPlan] = useState<ContentPlan | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  // A post id to open straight into the board's drawer (from Top Posts / a new
  // newsletter draft), so those cards lead somewhere.
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const { data: analytics, reload: reloadAnalytics } = useAnalytics(agentKey)

  const load = useCallback(async () => {
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`/api/dashboard/${agentKey}/posts?counts=1`, { cache: 'no-store' }),
        fetch(`/api/dashboard/${agentKey}/runs`, { cache: 'no-store' }),
      ])
      if (pRes.ok) { const d = await pRes.json(); setPosts(d.posts ?? []); setCounts(d.counts ?? null) }
      if (rRes.ok) { const d = await rRes.json(); setRuns(d.runs ?? []) }
    } catch { /* transient */ }
  }, [agentKey])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch(`/api/dashboard/${agentKey}/plan`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.plan) setPlan(d.plan) })
      .catch(() => { /* transient — the card stays in its loading state */ })
  }, [agentKey])

  /** Write the plan through immediately; the cron reads whatever is stored. */
  const savePlan = useCallback(async (next: ContentPlan) => {
    setPlan(next) // optimistic: the stepper must feel instant
    setPlanSaving(true)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: next }),
      })
      // Take the server's normalized copy back, so a clamped value is what the
      // card shows rather than what was clicked.
      if (res.ok) { const d = await res.json(); if (d?.plan) setPlan(d.plan) }
    } catch { /* transient */ } finally { setPlanSaving(false) }
  }, [agentKey])

  // The board is a section of this page now, so "go to the timeline" is a scroll
  // rather than a navigation. Cards that target one post also set openPostId.
  const focusTimeline = useCallback((postId?: string) => {
    if (postId) setOpenPostId(postId)
    document.getElementById(TIMELINE_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Posts & Timeline lives on this page; Project Status and LinkedIn are view swaps.
  if (view === 'projects') {
    return <ProjectStatus agentKey={agentKey} onBack={() => setView('dashboard')} />
  }

  if (view === 'linkedin') {
    return (
      <PeacockLinkedIn
        agentKey={agentKey}
        onBack={() => setView('dashboard')}
        onOpenPost={(id) => { setView('dashboard'); focusTimeline(id) }}
      />
    )
  }

  // The full-page chat workspace, for a long session that wants the whole screen.
  if (view === 'chat') {
    return (
      <div>
        <ChatShell agentKey={agentKey} agentName={agentName} description={description} presentation={p} />
        <button
          onClick={() => setView('dashboard')}
          className="fixed bottom-5 right-5 z-50 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
          style={{ background: ACCENT }}
        >
          ← Dashboard
        </button>
      </div>
    )
  }

  const inPipeline = counts ? OPEN_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0) : 0
  const stats = [
    { label: 'Published', value: counts?.published ?? 0, icon: <CheckCircle2 size={16} />, note: 'from your content plan' },
    // The one number that means "Peacock is waiting on you".
    { label: 'Awaiting approval', value: counts?.pending_approval ?? 0, icon: <CalendarClock size={16} />, note: 'from your content plan' },
    { label: 'In pipeline', value: inPipeline, icon: <Layers size={16} />, note: 'from your content plan' },
    // The only analytics figure left on the dashboard: the detail moved to the
    // LinkedIn page, so this tile is the way in.
    analytics?.hasData
      ? { label: 'Impressions', value: compact(analytics.impressions30d), icon: <Eye size={16} />, note: 'last 30 days — see LinkedIn', onClick: () => setView('linkedin') }
      : { label: 'Impressions', value: '—', icon: <Eye size={16} />, note: 'no numbers yet — see LinkedIn', onClick: () => setView('linkedin') },
  ]

  return (
    <div style={{ minHeight: '100vh', color: '#1f2430', background: 'linear-gradient(135deg,#f0f3ff 0%,#e7eefe 100%)' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 32px 60px' }}>

        {/* page heading — EPM pattern: breadcrumb, navy title, gray subtitle */}
        <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <Link href="/" className="hover:text-[#1e248c]">Agent Kingdom</Link>
              <span aria-hidden>›</span>
              <span className="text-[#1e248c] font-medium">Peacock</span>
            </div>
            <h1 className="text-3xl font-bold text-[#1e248c]">Peacock</h1>
            <p className="text-gray-500 text-sm mt-1">{p.tagline} — plan, draft and publish LinkedIn content.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('linkedin')} className={PILL}>
              <BarChart3 size={13} /> LinkedIn
            </button>
            <button onClick={() => setView('projects')} className={PILL}>
              <ListChecks size={13} /> Project Status
            </button>
            <button onClick={() => setDockOpen((v) => !v)} className={dockOpen ? PILL : PILL_PRIMARY}>
              <Sparkles size={13} /> {dockOpen ? 'Hide chat' : 'Ask Peacock'}
            </button>
          </div>
        </header>

        {/* dashboard | docked chat. One grid so the chat takes real space rather
            than covering the plan you are discussing. */}
        <div
          className="grid items-start"
          style={{ gridTemplateColumns: dockOpen ? 'minmax(0,1fr) 400px' : 'minmax(0,1fr)', gap: dockOpen ? 20 : 0 }}
        >
          <div style={{ minWidth: 0 }}>
            {/* stat tiles */}
            <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: dockOpen ? 'repeat(2,1fr)' : 'repeat(4,1fr)' }}>
              {stats.map((st) => (
                <StatTile key={st.label} {...st} />
              ))}
            </div>

            {/* Posts & Timeline — the planning surface, in place rather than on a
                separate page. No card wrapper: the split pane inside is already one,
                and nesting them double-borders the whole board. */}
            <div id={TIMELINE_ID} style={{ marginBottom: 20, scrollMarginTop: 16 }}>
              <PostsBoard
                embedded
                agentKey={agentKey}
                initialOpenPostId={openPostId}
                onDrawerClosed={() => { setOpenPostId(null); load(); reloadAnalytics() }}
              />
            </div>

            <ContentPlanBar
              plan={plan}
              saving={planSaving}
              onChange={savePlan}
              scheduled={posts.filter((x) => x.publishDate).length}
            />

            {/* main grid */}
            <div className="grid gap-4 items-start"
              style={{ gridTemplateColumns: dockOpen ? 'minmax(0,1fr)' : '1.62fr 1fr' }}>
              {/* LEFT — Recent Posts used to sit under this. It listed the four
                  newest rows of the very table directly above it, so it was a
                  strict subset of Posts & Timeline and never told you anything
                  the board had not already said. */}
              <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
                <NewsletterIdeas
                  agentKey={agentKey}
                  onOpenPost={(id) => focusTimeline(id)}
                />
              </div>

              {/* RIGHT */}
              <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
                <PipelineDonut counts={counts} />
                {/* agent activity */}
                <div style={{ ...CARD, padding: '20px 24px 12px' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Activity size={14} style={{ color: ACCENT }} />
                    <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">Agent Activity</h3>
                  </div>
                  {runs.length === 0 && <p className="text-[13px] text-gray-400 py-3">No runs yet.</p>}
                  {runs.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex gap-3" style={{ padding: '11px 0', borderTop: '1px solid #eef1f8' }}>
                      <span className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 8, flex: 'none', background: r.status === 'error' ? '#fdecec' : ACCENT_BG, color: r.status === 'error' ? '#e5484d' : ACCENT }}><Sparkles size={13} /></span>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#3a3f4d', lineHeight: 1.45 }}>{r.pass}/{r.trigger} — {(r.summary ?? r.error ?? r.status).slice(0, 90)}</div>
                        <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{fmtDateTime(r.startedAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {dockOpen && (
            <PeacockChatDock
              agentKey={agentKey}
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

function StatTile({
  label, value, note, icon, onClick,
}: {
  label: string
  value: string | number
  note: string
  icon: React.ReactNode
  onClick?: () => void
}) {
  const inner = (
    <>
      <div>
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="text-2xl font-bold text-[#1e248c] mt-1" style={{ letterSpacing: '-.02em' }}>{value}</div>
        <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-0.5">
          {note}{onClick && <ChevronRight size={11} />}
        </div>
      </div>
      <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: ACCENT_BG, color: ACCENT }}>{icon}</span>
    </>
  )
  if (!onClick) {
    return <div className="flex items-start justify-between" style={{ ...CARD, padding: '14px 18px' }}>{inner}</div>
  }
  return (
    <button onClick={onClick} className="flex items-start justify-between text-left cursor-pointer hover:bg-blue-50/40 transition-colors"
      style={{ ...CARD, padding: '14px 18px', fontFamily: 'inherit' }}>
      {inner}
    </button>
  )
}

/**
 * Content Plan as a single row.
 *
 * It only ever held two settings — cadence and which pillars are in play — and
 * the week preview it used to carry duplicated Posts & Timeline directly above
 * it, so the full card was spending a screenful to say very little.
 *
 * Both settings are now persisted and read by the weekly author cron, so this
 * card is a control rather than a decoration. Zero posts a week is the
 * interesting setting: it turns off Peacock's unprompted authoring entirely,
 * leaving the plan to Maxim and the Newsletter Ideas card. The row states that
 * in words, because a bare "0 / week" reads like an empty field rather than a
 * deliberate choice.
 */
function ContentPlanBar({
  plan, saving, onChange, scheduled,
}: {
  plan: ContentPlan | null
  saving: boolean
  onChange: (next: ContentPlan) => void
  scheduled: number
}) {
  if (!plan) {
    return (
      <div className="flex items-center gap-2" style={{ ...CARD, padding: '12px 18px', marginBottom: 20 }}>
        <h3 className="text-[13.5px] font-semibold text-[#1e248c] m-0">Content Plan</h3>
        <span className="text-[12px] text-gray-400">loading…</span>
      </div>
    )
  }

  const off = plan.postsPerWeek === 0
  const setCount = (n: number) =>
    onChange({ ...plan, postsPerWeek: Math.min(MAX_POSTS_PER_WEEK, Math.max(0, n)) })
  const toggleType = (t: string) =>
    onChange({
      ...plan,
      postTypes: plan.postTypes.includes(t)
        ? plan.postTypes.filter((x) => x !== t)
        : [...plan.postTypes, t],
    })

  return (
    <div className="flex items-center gap-4 flex-wrap"
      style={{ ...CARD, padding: '12px 18px', marginBottom: 20,
        // A paused plan is a state worth noticing from across the room.
        borderColor: off ? '#f0d9a8' : '#e3e8f4', background: off ? '#fffdf7' : '#fff' }}>
      <div className="flex items-center gap-2" style={{ flex: 'none' }}>
        <h3 className="text-[13.5px] font-semibold text-[#1e248c] m-0">Content Plan</h3>
        <span title="Posts in the plan that already have a publish date"
          style={{ fontSize: 11, fontWeight: 600, color: ACCENT, background: ACCENT_BG, padding: '3px 8px', borderRadius: 999 }}>
          {scheduled} scheduled
        </span>
        {saving && <span className="text-[11px] text-gray-400">saving…</span>}
      </div>

      <div className="flex items-center gap-2" style={{ flex: 'none' }}>
        <button onClick={() => setCount(plan.postsPerWeek - 1)}
          disabled={plan.postsPerWeek <= 0}
          aria-label="Fewer posts per week"
          title={plan.postsPerWeek <= 0 ? 'Already off' : 'Fewer posts per week — 0 turns off automatic drafting'}
          className="flex items-center justify-center"
          style={{ width: 24, height: 24, border: '1px solid #dfe6f3', background: '#fff', borderRadius: 7,
            color: ACCENT, cursor: plan.postsPerWeek <= 0 ? 'not-allowed' : 'pointer',
            opacity: plan.postsPerWeek <= 0 ? 0.4 : 1 }}><Minus size={13} /></button>
        <span className="flex items-baseline gap-1">
          <span className="text-lg font-bold" style={{ lineHeight: 1, color: off ? '#b4801f' : '#1e248c' }}>
            {plan.postsPerWeek}
          </span>
          <span className="text-[12px] text-gray-400 font-medium">/ week</span>
        </span>
        <button onClick={() => setCount(plan.postsPerWeek + 1)}
          disabled={plan.postsPerWeek >= MAX_POSTS_PER_WEEK}
          aria-label="More posts per week"
          className="flex items-center justify-center"
          style={{ width: 24, height: 24, border: '1px solid #dfe6f3', background: '#fff', borderRadius: 7,
            color: ACCENT, cursor: plan.postsPerWeek >= MAX_POSTS_PER_WEEK ? 'not-allowed' : 'pointer',
            opacity: plan.postsPerWeek >= MAX_POSTS_PER_WEEK ? 0.4 : 1 }}><Plus size={13} /></button>
      </div>

      <div style={{ width: 1, height: 22, background: '#e7ebf5', flex: 'none' }} />

      {off ? (
        <div className="flex items-center gap-1.5" style={{ flex: 1, minWidth: 0 }}>
          <PauseCircle size={14} style={{ color: '#b4801f', flex: 'none' }} />
          <span style={{ fontSize: 12, color: '#8a6516', lineHeight: 1.4 }}>
            Peacock won&apos;t draft posts on its own — the plan is yours and Newsletter Ideas&apos;.
            It still fixes anything you set to <strong>Revise</strong>.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5" style={{ flex: 1, minWidth: 0 }}>
          {POST_TYPES.map((t) => {
            const on = plan.postTypes.includes(t)
            return (
              <button key={t} onClick={() => toggleType(t)}
                title={on ? `${t} — Peacock may draft this` : `${t} — excluded from the weekly run`}
                className="flex items-center gap-1.5 font-medium cursor-pointer"
                style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 999, border: `1px solid ${on ? '#b9c6ea' : '#e3e8f4'}`,
                  background: on ? ACCENT_BG : '#fff', color: on ? ACCENT : '#9ca3af' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? typeColor(t) : '#cbd0da' }} /> {t}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}


function PipelineDonut({ counts }: { counts: Counts | null }) {
  const order = STATUS_ORDER
  const total = counts?.total ?? 0
  let acc = 0
  const segments = order.map((s) => {
    const n = counts?.[s] ?? 0
    const start = total ? (acc / total) * 360 : 0
    acc += n
    const end = total ? (acc / total) * 360 : 0
    return `${STATUS_META[s].color} ${start}deg ${end}deg`
  })
  const donut = total ? `conic-gradient(${segments.join(',')})` : '#e7ebf5'

  return (
    <div style={{ ...CARD, padding: '20px 24px' }}>
      <h3 className="text-[15px] font-semibold text-[#1e248c] m-0 mb-4">Content Pipeline</h3>
      <div className="flex items-center gap-6">
        <div className="flex items-center justify-center" style={{ width: 124, height: 124, flex: 'none', borderRadius: '50%', background: donut }}>
          <div className="flex flex-col items-center justify-center" style={{ width: 84, height: 84, borderRadius: '50%', background: '#fff' }}>
            <span className="text-2xl font-bold text-[#1e248c]" style={{ lineHeight: 1 }}>{total}</span>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, marginTop: 2 }}>total</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2.5">
          {order.map((s) => (
            <div key={s} className="flex items-center gap-2.5">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_META[s].color, flex: 'none' }} />
              <span className="flex-1 text-[13px] text-gray-600">{STATUS_META[s].label}</span>
              <span className="text-[13px] font-bold text-[#1e248c]">{counts?.[s] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
