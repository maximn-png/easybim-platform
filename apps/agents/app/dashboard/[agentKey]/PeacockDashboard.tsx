'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Minus, Plus, CheckCircle2, CalendarClock, Layers, Eye,
  CalendarRange, TrendingUp, Activity, Sparkles, ListChecks,
} from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import ChatShell from './ChatShell'
import ProjectStatus from './ProjectStatus'

// Design palette (from Peacock Agent.dc.html)
const PURPLE = '#7b5cff'
const PURPLE_2 = '#9d6bff'
const CARD = { background: '#fff', border: '1px solid #eeecf6', borderRadius: 22, boxShadow: '0 6px 20px rgba(90,70,180,.05)' }

type PostStatus = 'idea' | 'drafting' | 'ready' | 'scheduled' | 'published'
interface PostDTO {
  id: string; title: string; body: string | null; postType: string | null
  status: PostStatus; publishDate: string | null; imageUrl: string | null
  linkedinUrl: string | null; createdAt: string; updatedAt: string
}
interface Counts { idea: number; drafting: number; ready: number; scheduled: number; published: number; total: number }
interface RunDTO { id: string; pass: string; trigger: string; status: string; summary: string | null; error: string | null; startedAt: string }

const POST_TYPES = ['1. Professional', '2. Client Connection', '3. New Employee', '4. Project', '5. Social', '6. Personal', '7. Other']

const STATUS_META: Record<PostStatus, { label: string; color: string }> = {
  idea: { label: 'Idea', color: '#c4b5fd' },
  drafting: { label: 'Drafting', color: '#a78bfa' },
  ready: { label: 'Ready', color: PURPLE },
  scheduled: { label: 'Scheduled', color: '#38bdf8' },
  published: { label: 'Published', color: '#22c55e' },
}

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

  // Project Status is a full-page view swap (item 6).
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
          className="fixed bottom-5 right-5 z-50 rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg"
          style={{ background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})` }}
        >
          ← Dashboard
        </button>
      </div>
    )
  }

  const inPipeline = counts ? counts.idea + counts.drafting + counts.ready : 0
  const stats = [
    { label: 'Published', value: counts?.published ?? 0, icon: <CheckCircle2 size={18} />, iconBg: '#e8f9ee', iconColor: '#16a34a' },
    { label: 'Scheduled', value: counts?.scheduled ?? 0, icon: <CalendarClock size={18} />, iconBg: '#e6f6fd', iconColor: '#0ea5e9' },
    { label: 'In pipeline', value: inPipeline, icon: <Layers size={18} />, iconBg: '#f0ecff', iconColor: PURPLE },
    { label: 'Impressions', value: '—', icon: <Eye size={18} />, iconBg: '#f3f4f6', iconColor: '#9ca3af', pending: true },
  ]

  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Manrope','Assistant',system-ui,sans-serif", color: '#1f2430', background: 'linear-gradient(180deg,#faf9ff 0%,#f5f3fd 100%)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 28px 60px' }}>

        {/* top bar */}
        <header className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 30, filter: 'drop-shadow(0 6px 14px rgba(123,92,255,.28))' }}>🦚</span>
            <div>
              <div className="flex items-center gap-2.5">
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Peacock</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: PURPLE, background: '#f0ecff', padding: '4px 10px', borderRadius: 999 }}>{p.tagline}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#9aa0ac', fontWeight: 500, marginTop: 2 }}>
                <Link href="/" className="inline-flex items-center gap-1" style={{ color: '#9aa0ac' }}><ArrowLeft size={12} /> Agent Kingdom · Dashboard</Link>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('projects')}
              className="flex items-center gap-2 font-bold"
              style={{ fontSize: 14, padding: '10px 16px', borderRadius: 12, border: '1px solid #e7e3f7', background: '#fff', color: PURPLE }}
            >
              <ListChecks size={16} /> Project Status
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-2 text-white font-bold"
              style={{ fontSize: 14.5, padding: '11px 18px', borderRadius: 14, background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})`, boxShadow: '0 10px 24px rgba(123,92,255,.34)' }}
            >
              <span style={{ fontSize: 19 }}>🦚</span> Ask Peacock
            </button>
          </div>
        </header>

        {/* stat cards */}
        <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {stats.map((st) => (
            <div key={st.label} style={{ ...CARD, padding: '18px 20px' }}>
              <div className="flex items-center justify-between mb-3.5">
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#9aa0ac' }}>{st.label}</span>
                <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 11, background: st.iconBg, color: st.iconColor }}>{st.icon}</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{st.value}</div>
              <div style={{ fontSize: 12, color: '#a9adb8', marginTop: 10 }}>{st.pending ? 'Connect LinkedIn' : 'from your content plan'}</div>
            </div>
          ))}
        </div>

        {/* content plan */}
        <div style={{ ...CARD, padding: '22px 24px', marginBottom: 20 }}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center text-white" style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})` }}><CalendarRange size={17} /></span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Content Plan</h3>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9aa0ac' }}>Design your posting week — then let Peacock draft it.</p>
            </div>
            <button onClick={() => setChatOpen(true)} className="flex items-center gap-2 text-white font-bold" style={{ fontSize: 13.5, padding: '11px 17px', borderRadius: 12, background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})`, boxShadow: '0 8px 20px rgba(123,92,255,.3)' }}>
              <span style={{ fontSize: 16 }}>🦚</span> Plan with Peacock
            </button>
          </div>

          <div className="grid gap-8 items-start" style={{ gridTemplateColumns: '1fr 1.25fr' }}>
            {/* controls */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a5f6e', marginBottom: 12 }}>Posts per week</div>
              <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setPostsPerWeek((n) => Math.max(1, n - 1))} className="flex items-center justify-center" style={{ width: 38, height: 38, border: '1px solid #e7e3f7', background: '#fff', borderRadius: 11, color: PURPLE, fontSize: 20, fontWeight: 700 }}><Minus size={18} /></button>
                <div className="flex items-baseline gap-1.5">
                  <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{postsPerWeek}</span>
                  <span style={{ fontSize: 13, color: '#9aa0ac', fontWeight: 600 }}>/ week</span>
                </div>
                <button onClick={() => setPostsPerWeek((n) => Math.min(7, n + 1))} className="flex items-center justify-center" style={{ width: 38, height: 38, border: '1px solid #e7e3f7', background: '#fff', borderRadius: 11, color: PURPLE, fontSize: 20, fontWeight: 700 }}><Plus size={18} /></button>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: '#eeecf6', overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ height: '100%', width: `${(postsPerWeek / 7) * 100}%`, borderRadius: 999, background: `linear-gradient(90deg,${PURPLE},${PURPLE_2})`, transition: 'width .25s' }} />
              </div>

              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a5f6e', marginBottom: 12 }}>Post types</div>
              <div className="flex flex-wrap gap-2.5">
                {POST_TYPES.map((t) => {
                  const on = activeTypes.has(t)
                  return (
                    <button key={t} onClick={() => setActiveTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })}
                      className="flex items-center gap-2 font-semibold" style={{ fontSize: 13, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? PURPLE : '#e7e3f7'}`, background: on ? '#f0ecff' : '#fff', color: on ? PURPLE : '#5a5f6e' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? PURPLE : '#cbd0da' }} /> {t}
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
            {/* impressions (LinkedIn — pending) */}
            <div style={{ ...CARD, padding: '22px 24px' }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Impressions</h3>
                  <p style={{ margin: '5px 0 0', fontSize: 13, color: '#9aa0ac' }}>Last 8 weeks</p>
                </div>
                <TrendingUp size={20} style={{ color: '#c8cdd8' }} />
              </div>
              <PendingLinkedIn label="Impressions & engagement appear once LinkedIn is connected." />
            </div>

            {/* top posts (recent; engagement pending) */}
            <div style={{ ...CARD, padding: '22px 24px 12px' }}>
              <div className="flex items-center justify-between mb-2">
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Recent Posts</h3>
                <span style={{ fontSize: 12, color: '#a9adb8' }}>engagement via LinkedIn</span>
              </div>
              {posts.length === 0 && <p style={{ fontSize: 13, color: '#a9adb8', padding: '14px 0' }}>No posts yet — plan one with Peacock.</p>}
              {[...posts]
                .sort((a, b) => (b.publishDate ?? b.createdAt).localeCompare(a.publishDate ?? a.createdAt))
                .slice(0, 4)
                .map((post, i) => (
                  <div key={post.id} className="flex items-center gap-4" style={{ padding: '13px 0', borderTop: '1px solid #f4f2fa' }}>
                    <span className="flex items-center justify-center font-extrabold" style={{ width: 30, height: 30, borderRadius: 9, background: '#f0ecff', color: PURPLE, fontSize: 13 }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#2b2f3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                      <div style={{ fontSize: 12, color: '#a9adb8', marginTop: 3 }}>{post.postType ?? '—'} · {fmtDate(post.publishDate)}</div>
                    </div>
                    <StatusPill status={post.status} />
                  </div>
                ))}
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-4">
            <PipelineDonut counts={counts} />
            {/* agent activity */}
            <div style={{ ...CARD, padding: '22px 24px 14px' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Activity size={16} style={{ color: PURPLE }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Agent Activity</h3>
              </div>
              {runs.length === 0 && <p style={{ fontSize: 13, color: '#a9adb8', padding: '12px 0' }}>No runs yet.</p>}
              {runs.slice(0, 5).map((r) => (
                <div key={r.id} className="flex gap-3" style={{ padding: '12px 0', borderTop: '1px solid #f4f2fa' }}>
                  <span className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 10, flex: 'none', background: r.status === 'error' ? '#fdecec' : '#f0ecff', color: r.status === 'error' ? '#e5484d' : PURPLE }}><Sparkles size={15} /></span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#3a3f4d', lineHeight: 1.4 }}>{r.pass}/{r.trigger} — {(r.summary ?? r.error ?? r.status).slice(0, 90)}</div>
                    <div style={{ fontSize: 12, color: '#b0aebc', marginTop: 2 }}>{fmtDateTime(r.startedAt)}</div>
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
  const m = STATUS_META[status]
  return <span style={{ fontSize: 11.5, fontWeight: 700, color: m.color, background: `${m.color}1f`, padding: '4px 10px', borderRadius: 999 }}>{m.label}</span>
}

function PendingLinkedIn({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ height: 150, border: '1px dashed #e0dcf3', borderRadius: 14, background: '#faf9ff' }}>
      <Eye size={22} style={{ color: '#c8cdd8', marginBottom: 8 }} />
      <div style={{ fontSize: 13, color: '#9aa0ac', maxWidth: 320 }}>{label}</div>
    </div>
  )
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
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#5a5f6e' }}>This week</span>
        <span style={{ fontSize: 12, color: '#a9adb8' }}>{posts.filter((p) => p.publishDate).length} scheduled</span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(7,1fr)' }}>
        {days.map((d) => (
          <div key={d.key} style={{ border: `1px dashed ${d.isToday ? PURPLE : '#e7e3f7'}`, background: d.isToday ? '#f6f2ff' : '#fbfbfe', borderRadius: 12, padding: '8px 6px', minHeight: 104 }} className="flex flex-col items-center gap-1.5">
            <span style={{ fontSize: 11, fontWeight: 700, color: d.isToday ? PURPLE : '#9aa0ac' }}>{d.label}</span>
            <div className="flex flex-col gap-1.5 w-full">
              {d.posts.map((post) => (
                <div key={post.id} title={post.title} style={{ height: 22, borderRadius: 7, background: `${STATUS_META[post.status].color}22`, borderLeft: `3px solid ${STATUS_META[post.status].color}` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PipelineDonut({ counts }: { counts: Counts | null }) {
  const order: PostStatus[] = ['idea', 'drafting', 'ready', 'scheduled', 'published']
  const total = counts?.total ?? 0
  let acc = 0
  const segments = order.map((s) => {
    const n = counts?.[s] ?? 0
    const start = total ? (acc / total) * 360 : 0
    acc += n
    const end = total ? (acc / total) * 360 : 0
    return `${STATUS_META[s].color} ${start}deg ${end}deg`
  })
  const donut = total ? `conic-gradient(${segments.join(',')})` : '#eeecf6'

  return (
    <div style={{ ...CARD, padding: '22px 24px' }}>
      <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800 }}>Content Pipeline</h3>
      <div className="flex items-center gap-6">
        <div className="flex items-center justify-center" style={{ width: 132, height: 132, flex: 'none', borderRadius: '50%', background: donut }}>
          <div className="flex flex-col items-center justify-center" style={{ width: 88, height: 88, borderRadius: '50%', background: '#fff' }}>
            <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{total}</span>
            <span style={{ fontSize: 11, color: '#a9adb8', fontWeight: 600, marginTop: 2 }}>total</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-3">
          {order.map((s) => (
            <div key={s} className="flex items-center gap-2.5">
              <span style={{ width: 11, height: 11, borderRadius: 3, background: STATUS_META[s].color, flex: 'none' }} />
              <span className="flex-1" style={{ fontSize: 13, color: '#5a5f6e', fontWeight: 500 }}>{STATUS_META[s].label}</span>
              <span style={{ fontSize: 13.5, fontWeight: 800 }}>{counts?.[s] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'unscheduled'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
