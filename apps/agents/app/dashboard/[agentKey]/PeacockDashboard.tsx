'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Minus, Plus, CheckCircle2, CalendarClock, Layers, Eye, Activity, Sparkles, ListChecks,
} from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import ChatShell from './ChatShell'
import ProjectStatus from './ProjectStatus'
import PostsBoard from './PostsBoard'
import NewsletterIdeas from './NewsletterIdeas'
import { compact, ImpressionsCard, LinkedInStatusRow, TopPostsCard, useAnalytics } from './PeacockAnalytics'
import {
  ACCENT, ACCENT_BG, CARD, fmtDayMon, OPEN_STATUSES, POST_TYPES, PostDTO, PostStatus,
  STATUS_META, STATUS_ORDER, statusMeta,
} from './postMeta'

const TIMELINE_ID = 'posts-timeline'

// EPM-style buttons: quiet white pills, one solid-navy primary. No gradients.
export const PILL = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer'
export const PILL_PRIMARY = 'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1e248c] text-white hover:bg-[#3d47b8] transition-colors cursor-pointer border border-[#1e248c]'

type Counts = Record<PostStatus, number> & { total: number }
interface RunDTO { id: string; pass: string; trigger: string; status: string; summary: string | null; error: string | null; startedAt: string }

export default function PeacockDashboard({
  agentKey, agentName, description, presentation: p,
}: {
  agentKey: string; agentName: string; description: string; presentation: AgentPresentation
}) {
  const [chatOpen, setChatOpen] = useState(false)
  const [view, setView] = useState<'dashboard' | 'projects'>('dashboard')
  const [posts, setPosts] = useState<PostDTO[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [runs, setRuns] = useState<RunDTO[]>([])
  const [postsPerWeek, setPostsPerWeek] = useState(2)
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(['1. Professional', '4. Project']))
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

  // The board is a section of this page now, so "go to the timeline" is a scroll
  // rather than a navigation. Cards that target one post also set openPostId.
  const focusTimeline = useCallback((postId?: string) => {
    if (postId) setOpenPostId(postId)
    document.getElementById(TIMELINE_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Posts & Timeline lives on this page; Project Status is still a view swap.
  if (view === 'projects') {
    return <ProjectStatus agentKey={agentKey} onBack={() => setView('dashboard')} />
  }

  // Chat overlay reuses the existing full-page chat workspace.
  if (chatOpen) {
    return (
      <div>
        <ChatShell agentKey={agentKey} agentName={agentName} description={description} presentation={p} />
        <button
          onClick={() => setChatOpen(false)}
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
    analytics?.hasData
      ? { label: 'Impressions', value: compact(analytics.impressions30d), icon: <Eye size={16} />, note: 'last 30 days' }
      : { label: 'Impressions', value: '—', icon: <Eye size={16} />, note: 'no numbers yet — import below' },
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
            <button onClick={() => setView('projects')} className={PILL}>
              <ListChecks size={13} /> Project Status
            </button>
            <button onClick={() => setChatOpen(true)} className={PILL_PRIMARY}>
              <Sparkles size={13} /> Ask Peacock
            </button>
          </div>
        </header>

        {/* stat tiles */}
        <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {stats.map((st) => (
            <div key={st.label} className="flex items-start justify-between" style={{ ...CARD, padding: '14px 18px' }}>
              <div>
                <div className="text-xs font-medium text-gray-500">{st.label}</div>
                <div className="text-2xl font-bold text-[#1e248c] mt-1" style={{ letterSpacing: '-.02em' }}>{st.value}</div>
                <div className="text-[11px] text-gray-400 mt-1">{st.note}</div>
              </div>
              <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: ACCENT_BG, color: ACCENT }}>{st.icon}</span>
            </div>
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

        {/* content plan — settings only; drafting is asked for via Ask Peacock */}
        <div style={{ ...CARD, padding: '20px 24px', marginBottom: 20 }}>
          <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">Content Plan</h3>
          <p className="text-[13px] text-gray-500 mt-1 mb-5">Design your posting week — then ask Peacock to draft it.</p>

          <div className="grid gap-8 items-start" style={{ gridTemplateColumns: '1fr 1.25fr' }}>
            {/* controls */}
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-3">Posts per week</div>
              <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setPostsPerWeek((n) => Math.max(1, n - 1))} className="flex items-center justify-center cursor-pointer"
                  style={{ width: 32, height: 32, border: '1px solid #dfe6f3', background: '#fff', borderRadius: 9, color: ACCENT }}><Minus size={15} /></button>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-[#1e248c]" style={{ letterSpacing: '-.02em', lineHeight: 1 }}>{postsPerWeek}</span>
                  <span className="text-[13px] text-gray-400 font-medium">/ week</span>
                </div>
                <button onClick={() => setPostsPerWeek((n) => Math.min(7, n + 1))} className="flex items-center justify-center cursor-pointer"
                  style={{ width: 32, height: 32, border: '1px solid #dfe6f3', background: '#fff', borderRadius: 9, color: ACCENT }}><Plus size={15} /></button>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: '#e7ebf5', overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ height: '100%', width: `${(postsPerWeek / 7) * 100}%`, borderRadius: 999, background: ACCENT, transition: 'width .25s' }} />
              </div>

              <div className="text-xs font-semibold text-gray-600 mb-3">Post types</div>
              <div className="flex flex-wrap gap-2">
                {POST_TYPES.map((t) => {
                  const on = activeTypes.has(t)
                  return (
                    <button key={t} onClick={() => setActiveTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })}
                      className="flex items-center gap-1.5 font-medium cursor-pointer"
                      style={{ fontSize: 12, padding: '5px 11px', borderRadius: 999, border: `1px solid ${on ? '#b9c6ea' : '#e3e8f4'}`,
                        background: on ? ACCENT_BG : '#fff', color: on ? ACCENT : '#6b7280' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? ACCENT : '#cbd0da' }} /> {t}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* week preview */}
            <WeekPreview posts={posts} />
          </div>
        </div>

        {/* main grid */}
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '1.62fr 1fr' }}>
          {/* LEFT */}
          <div className="flex flex-col gap-4">
            <div>
              <ImpressionsCard agentKey={agentKey} data={analytics} onImported={reloadAnalytics} />
              <LinkedInStatusRow agentKey={agentKey} data={analytics} onChanged={reloadAnalytics} />
            </div>

            <TopPostsCard
              data={analytics}
              onOpenPost={(id) => focusTimeline(id)}
            />

            <NewsletterIdeas
              agentKey={agentKey}
              onOpenPost={(id) => focusTimeline(id)}
            />

            {/* recent posts */}
            <div style={{ ...CARD, padding: '20px 24px 10px' }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">Recent Posts</h3>
                <button onClick={() => focusTimeline()} className="cursor-pointer text-xs font-semibold"
                  style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', color: ACCENT }}>
                  See all →
                </button>
              </div>
              {posts.length === 0 && <p className="text-[13px] text-gray-400 py-3">No posts yet — plan one with Peacock.</p>}
              {[...posts]
                .sort((a, b) => (b.publishDate ?? b.createdAt).localeCompare(a.publishDate ?? a.createdAt))
                .slice(0, 4)
                .map((post, i) => (
                  <button key={post.id} onClick={() => focusTimeline(post.id)} className="flex items-center gap-4 w-full text-left cursor-pointer"
                    style={{ padding: '12px 0', background: 'transparent', fontFamily: 'inherit', border: 'none', borderTop: '1px solid #eef1f8' }}>
                    <span className="flex items-center justify-center font-bold" style={{ width: 28, height: 28, borderRadius: 8, background: ACCENT_BG, color: ACCENT, fontSize: 12.5, flex: 'none' }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div dir="auto" style={{ fontSize: 13.5, fontWeight: 600, color: '#2b2f3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                      <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{post.postType ?? '—'} · {fmtDayMon(post.publishDate)}</div>
                    </div>
                    <StatusPill status={post.status} />
                  </button>
                ))}
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-4">
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
    </div>
  )
}

function StatusPill({ status }: { status: PostStatus }) {
  const m = statusMeta(status)
  return <span style={{ fontSize: 11, fontWeight: 600, color: m.color, background: `${m.color}1a`, padding: '3px 9px', borderRadius: 999 }}>{m.label}</span>
}

function WeekPreview({ posts }: { posts: PostDTO[] }) {
  // Current week, Sunday → Saturday (Israel).
  const days = useMemo(() => {
    const now = new Date()
    const sunday = new Date(now); sunday.setDate(now.getDate() - now.getDay()); sunday.setHours(0, 0, 0, 0)
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return labels.map((label, i) => {
      const d = new Date(sunday); d.setDate(sunday.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      const isToday = key === new Date().toISOString().slice(0, 10)
      const dayPosts = posts.filter((p) => p.publishDate && p.publishDate.slice(0, 10) === key)
      return { label, key, isToday, posts: dayPosts }
    })
  }, [posts])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-600">This week</span>
        <span className="text-xs text-gray-400">{posts.filter((p) => p.publishDate).length} scheduled</span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(7,1fr)' }}>
        {days.map((d) => (
          <div key={d.key} style={{ border: `1px solid ${d.isToday ? '#b9c6ea' : '#e3e8f4'}`, background: d.isToday ? ACCENT_BG : '#fff', borderRadius: 10, padding: '8px 6px', minHeight: 104 }} className="flex flex-col items-center gap-1.5">
            <span style={{ fontSize: 11, fontWeight: 600, color: d.isToday ? ACCENT : '#9ca3af' }}>{d.label}</span>
            <div className="flex flex-col gap-1.5 w-full">
              {d.posts.map((post) => (
                <div key={post.id} title={post.title} style={{ height: 22, borderRadius: 6, background: `${statusMeta(post.status).color}22`, borderLeft: `3px solid ${statusMeta(post.status).color}` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
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
