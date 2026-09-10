'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare, MessageSquarePlus, Plus, Search, AlertCircle } from 'lucide-react'
import PostDrawer from './PostDrawer'
import {
  ACCENT, ACCENT_BG, addDays, CARD, dayStart, daysBetween, fmtDayMon, isoDay, isOverdue,
  POST_TYPES, PortalUser, PostDTO, PostSource, PostStatus, SOURCE_ORDER, sourceMeta,
  STATUS_META, statusMeta, STATUS_ORDER, typeColor,
} from './postMeta'

// Timeline geometry. Both panes share HEADER_H and ROW_H so a post's row lines
// up with its bar across the split.
// The list columns, shared by the header and every row so the two cannot drift.
const LIST_COLS = '1fr 138px 100px 126px 104px'

const DAY_W = 26
const ROW_H = 46
const HEADER_H = 52
// Show one week of the recent past as well: posts that slipped their date are
// exactly the ones needing attention, and a window starting today hides them.
const PAST_WEEKS = 1

const RANGE_OPTIONS = [
  { label: '1 month', weeks: 5 },
  { label: '2 months', weeks: 9 },
  { label: '3 months', weeks: 13 },
]

// The store also holds ~150 published posts imported from the retired board, so
// the planning view opens on the active plan and keeps the archive one click away.
type Scope = 'active' | 'published' | 'all'
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'active', label: 'Active plan' },
  { key: 'published', label: 'Archive' },
  { key: 'all', label: 'All' },
]

interface DragState { id: string; days: number }

export default function PostsBoard({
  agentKey, onBack, initialOpenPostId = null, embedded = false, onDrawerClosed,
}: {
  agentKey: string
  /** Omitted when embedded — there is nowhere to go back to. */
  onBack?: () => void
  /** Open straight into one post's drawer (arriving from a dashboard card). */
  initialOpenPostId?: string | null
  /** Render as a section of the dashboard rather than its own page: no page
   *  chrome, no back button, and the parent owns the padding. */
  embedded?: boolean
  /** Embedded only — lets the parent clear the post it asked us to open, so
   *  clicking the same card twice opens the drawer again. */
  onDrawerClosed?: () => void
}) {
  const [posts, setPosts] = useState<PostDTO[]>([])
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [weeks, setWeeks] = useState(9)
  // Arriving for a specific post: it may well be a published one, so start on the
  // scope that actually contains it.
  const [scope, setScope] = useState<Scope>(initialOpenPostId ? 'all' : 'active')
  const [openId, setOpenId] = useState<string | null>(initialOpenPostId)
  const [selectedId, setSelectedId] = useState<string | null>(initialOpenPostId)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  // Source filter — null = all. Client-side: the board already holds every row
  // it can show, so filtering here costs no round-trip.
  const [sourceFilter, setSourceFilter] = useState<PostSource | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ slim: '1' })
    if (scope === 'active') params.set('activeOnly', '1')
    if (scope === 'published') params.set('status', 'published')
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/posts?${params}`, { cache: 'no-store' })
      if (res.ok) { const d = await res.json(); setPosts(d.posts ?? []) }
    } catch { /* transient */ } finally { setLoading(false) }
  }, [agentKey, scope])

  useEffect(() => { load() }, [load])

  // Embedded, the board outlives the click that asks for a post, so the id
  // arrives as a prop change rather than as initial state. This is React's
  // "adjust state when a prop changes" pattern — during render rather than in an
  // effect, so it costs no extra commit. Tracking the id in both directions
  // matters: the parent clears it on close, and without recording that the same
  // card clicked twice would compare equal and never reopen. The post may be a
  // published one, so widen the scope to one that actually contains it.
  const [requestedPostId, setRequestedPostId] = useState(initialOpenPostId)
  if (initialOpenPostId !== requestedPostId) {
    setRequestedPostId(initialOpenPostId)
    if (initialOpenPostId) {
      setOpenId(initialOpenPostId)
      setSelectedId(initialOpenPostId)
      if (scope === 'active') setScope('all')
    }
  }

  // Owner options (Clerk portal users). Non-fatal if it fails — the picker just stays empty.
  useEffect(() => {
    fetch(`/api/dashboard/${agentKey}/users`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {})
  }, [agentKey])

  /** Optimistic PATCH — the row and its bar update before the round-trip. */
  const patchPost = useCallback(async (id: string, patch: Record<string, unknown>, optimistic?: Partial<PostDTO>) => {
    const before = posts.find((p) => p.id === id)
    if (optimistic) setPosts((xs) => xs.map((p) => (p.id === id ? { ...p, ...optimistic } : p)))
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('patch failed')
      const d = await res.json()
      if (d.post) setPosts((xs) => xs.map((p) => (p.id === id ? d.post : p)))
    } catch {
      if (before) setPosts((xs) => xs.map((p) => (p.id === id ? before : p))) // revert
    }
  }, [agentKey, posts])

  async function addPost() {
    const title = newTitle.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.post) { setPosts((xs) => [...xs, d.post]); setSelectedId(d.post.id) }
        setNewTitle('')
      }
    } catch { /* transient */ } finally { setAdding(false) }
  }

  async function deletePost(id: string) {
    setPosts((xs) => xs.filter((p) => p.id !== id))
    if (openId === id) setOpenId(null)
    try {
      await fetch(`/api/dashboard/${agentKey}/posts/${id}`, { method: 'DELETE' })
    } catch { load() }
  }

  // Dated posts first (chronological), then the undated backlog. Both panes
  // render this exact order.
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const bySource = sourceFilter ? posts.filter((p) => p.source === sourceFilter) : posts
    const matched = s
      ? bySource.filter(
          (p) =>
            p.title.toLowerCase().includes(s) ||
            (p.postType ?? '').toLowerCase().includes(s) ||
            sourceMeta(p.source).label.toLowerCase().includes(s)
        )
      : bySource
    const dated = matched.filter((p) => p.publishDate).sort((a, b) => a.publishDate!.localeCompare(b.publishDate!))
    const undated = matched.filter((p) => !p.publishDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return [...dated, ...undated]
  }, [posts, q, sourceFilter])

  // Per-source totals for the filter chips, counted before the filter is
  // applied so each chip keeps advertising what it would select.
  const sourceCounts = useMemo(() => {
    const out = {} as Record<PostSource, number>
    for (const s of SOURCE_ORDER) out[s] = 0
    for (const p of posts) if (p.source in out) out[p.source] += 1
    return out
  }, [posts])

  // Timeline starts on a Sunday (Israeli week), one week back so slipped posts
  // stay visible; the labelled span is the forward planning horizon.
  const rangeStart = useMemo(() => {
    const today = dayStart(new Date())
    return addDays(today, -today.getDay() - PAST_WEEKS * 7)
  }, [])
  const totalDays = (weeks + PAST_WEEKS) * 7
  const gridW = totalDays * DAY_W
  const todayOffset = daysBetween(rangeStart, new Date())

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i)),
    [rangeStart, totalDays]
  )

  // Month header segments: [label, dayCount] runs across the day grid.
  const months = useMemo(() => {
    const out: { label: string; span: number }[] = []
    for (const d of days) {
      const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      const last = out[out.length - 1]
      if (last && last.label === label) last.span += 1
      else out.push({ label, span: 1 })
    }
    return out
  }, [days])

  function commitDrag(post: PostDTO, dayDelta: number) {
    const shift = (iso: string | null) => (iso ? addDays(new Date(iso), dayDelta).toISOString() : null)
    patchPost(post.id, { shiftDays: dayDelta }, {
      publishDate: shift(post.publishDate),
      draftStartDate: shift(post.draftStartDate),
    })
  }

  const openPost = openId ? posts.find((p) => p.id === openId) ?? null : null

  const body = (
    <>
        {/* header */}
        <header className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span style={{ fontSize: embedded ? 15 : 20, fontWeight: 600, color: ACCENT }}>Posts &amp; Timeline</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT, background: ACCENT_BG, padding: '3px 9px', borderRadius: 999 }}>
                {rows.length} posts
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>
              Plan two months ahead · click a post to open the draft and work on it with Peacock
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center" style={{ background: '#fff', border: '1px solid #e3e8f4', borderRadius: 999, padding: 2 }}>
              {SCOPES.map((s) => (
                <button key={s.key} onClick={() => { setLoading(true); setScope(s.key) }}
                  style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: scope === s.key ? ACCENT_BG : 'transparent', color: scope === s.key ? ACCENT : '#6b7280' }}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* source filter — click a chip to see only what that origin produced */}
            <div className="flex items-center" style={{ background: '#fff', border: '1px solid #e3e8f4', borderRadius: 999, padding: 2 }}>
              <button onClick={() => setSourceFilter(null)}
                title="All sources"
                style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: sourceFilter === null ? ACCENT_BG : 'transparent', color: sourceFilter === null ? ACCENT : '#6b7280' }}>
                All
              </button>
              {SOURCE_ORDER.map((s) => {
                const m = sourceMeta(s)
                const on = sourceFilter === s
                return (
                  <button key={s} onClick={() => setSourceFilter(on ? null : s)}
                    title={m.hint}
                    style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: on ? `${m.color}1f` : 'transparent', color: on ? m.color : '#6b7280' }}>
                    {m.short}
                    <span style={{ marginLeft: 5, fontSize: 10.5, opacity: 0.75 }}>{sourceCounts[s] ?? 0}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2" style={{ background: '#fff', border: '1px solid #e3e8f4', borderRadius: 999, padding: '6px 12px' }}>
              <Search size={13} style={{ color: '#9ca3af' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search post…" dir="auto"
                style={{ border: 'none', outline: 'none', fontSize: 13, background: 'transparent', width: 150, fontFamily: 'inherit' }} />
            </div>
            <div className="flex items-center" style={{ background: '#fff', border: '1px solid #e3e8f4', borderRadius: 999, padding: 2 }}>
              {RANGE_OPTIONS.map((o) => (
                <button key={o.weeks} onClick={() => setWeeks(o.weeks)}
                  style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: weeks === o.weeks ? ACCENT_BG : 'transparent', color: weeks === o.weeks ? ACCENT : '#6b7280' }}>
                  {o.label}
                </button>
              ))}
            </div>
            {!embedded && onBack && (
              <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer">
                <ArrowLeft size={13} /> Dashboard
              </button>
            )}
          </div>
        </header>

        {/* split: list | timeline */}
        {/* The list needs 620px for its five columns; the timeline pane scrolls
            its own day grid, so it can be squeezed hard. Keeping its floor low
            is what lets the board sit next to the 400px chat dock on a 1440px
            screen without the page itself scrolling sideways. */}
        <div style={{ ...CARD, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(620px, 1.15fr) minmax(260px, 1fr)' }}>
          {/* ---------- LEFT: list ---------- */}
          <div style={{ borderRight: '1px solid #e7ebf5', minWidth: 0 }}>
            <div className="grid items-center"
              style={{ gridTemplateColumns: LIST_COLS, height: HEADER_H, padding: '0 16px',
                borderBottom: '1px solid #eef1f8', fontSize: 12, fontWeight: 700, color: '#9aa0ac' }}>
              <span>Item</span>
              <span>Status</span>
              <span>Publish Date</span>
              <span>PostType</span>
              <span title="Who put this post in the plan">Source</span>
            </div>

            {loading && <div style={{ padding: 28, textAlign: 'center', color: '#a9adb8', fontSize: 14 }}>Loading…</div>}
            {!loading && rows.length === 0 && (
              <div style={{ padding: 28, textAlign: 'center', color: '#a9adb8', fontSize: 14 }}>
                {q ? 'No posts match your search.' : 'No posts yet — add one below, or ask Peacock to plan the month.'}
              </div>
            )}

            {rows.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                selected={selectedId === post.id}
                onSelect={() => setSelectedId(post.id)}
                onOpen={() => { setSelectedId(post.id); setOpenId(post.id) }}
                onPatch={patchPost}
                onDelete={() => deletePost(post.id)}
              />
            ))}

            {/* add item */}
            <div className="flex items-center gap-2" style={{ height: ROW_H, padding: '0 16px', borderTop: '1px solid #f2f5fa' }}>
              <Plus size={15} style={{ color: '#b6c0e2' }} />
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addPost() }}
                onBlur={() => { if (newTitle.trim()) addPost() }}
                placeholder="Add item"
                dir="auto"
                style={{ border: 'none', outline: 'none', fontSize: 13.5, background: 'transparent', flex: 1, fontFamily: 'inherit', color: '#2b2f3a' }}
              />
            </div>
          </div>

          {/* ---------- RIGHT: timeline ---------- */}
          <div style={{ overflowX: 'auto', minWidth: 0 }}>
            <div style={{ width: gridW, position: 'relative' }}>
              {/* header: months + days */}
              <div style={{ height: HEADER_H, borderBottom: '1px solid #eef1f8', position: 'relative' }}>
                <div className="flex" style={{ height: 22 }}>
                  {months.map((m, i) => (
                    <div key={`${m.label}-${i}`}
                      style={{ width: m.span * DAY_W, flex: 'none', fontSize: 11.5, fontWeight: 800, color: '#5a5f6e',
                        padding: '4px 0 0 8px', borderRight: '1px solid #eef1f8', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="flex" style={{ height: HEADER_H - 22 }}>
                  {days.map((d) => {
                    const weekend = d.getDay() === 5 || d.getDay() === 6 // Fri/Sat in Israel
                    const isToday = daysBetween(rangeStart, d) === todayOffset
                    return (
                      <div key={d.toISOString()} className="flex flex-col items-center justify-center"
                        style={{ width: DAY_W, flex: 'none', background: isToday ? '#eef3fe' : weekend ? '#f7f9fd' : '#fff',
                          borderLeft: d.getDay() === 0 ? '1px solid #e7ebf5' : 'none' }}>
                        <span style={{ fontSize: 10.5, fontWeight: isToday ? 800 : 600, color: isToday ? ACCENT : '#8b909c', lineHeight: 1.1 }}>
                          {d.getDate()}
                        </span>
                        <span style={{ fontSize: 8.5, color: isToday ? ACCENT : '#c0c4ce', fontWeight: 600 }}>
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* today line */}
              {todayOffset >= 0 && todayOffset < totalDays && (
                <div style={{ position: 'absolute', top: HEADER_H, bottom: 0, left: todayOffset * DAY_W + DAY_W / 2,
                  width: 2, background: `${ACCENT}66`, pointerEvents: 'none', zIndex: 2 }} />
              )}

              {/* rows */}
              {loading && <div style={{ height: ROW_H }} />}
              {rows.map((post) => (
                <GanttRow
                  key={post.id}
                  post={post}
                  days={days}
                  rangeStart={rangeStart}
                  totalDays={totalDays}
                  selected={selectedId === post.id}
                  drag={drag?.id === post.id ? drag : null}
                  onSelect={() => setSelectedId(post.id)}
                  onOpen={() => { setSelectedId(post.id); setOpenId(post.id) }}
                  onDragStart={(startX) => beginDrag(post, startX)}
                />
              ))}
              <div style={{ height: ROW_H, borderTop: '1px solid #f2f5fa' }} />
            </div>
          </div>
        </div>

        <Legend />
    </>
  )

  // The drawer is fixed-position, so it sits outside the body in both modes.
  const drawer = openPost && (
    <PostDrawer
      agentKey={agentKey}
      post={openPost}
      users={users}
      onClose={() => { setOpenId(null); onDrawerClosed?.() }}
      onPostChanged={(p) => setPosts((xs) => xs.map((x) => (x.id === p.id ? p : x)))}
      onPatch={patchPost}
      onDelete={() => deletePost(openPost.id)}
    />
  )

  // Embedded: the dashboard owns the page shell and the padding, so contribute
  // nothing but the section itself.
  if (embedded) {
    return <div>{body}{drawer}</div>
  }

  return (
    <div style={{ minHeight: '100vh', color: '#1f2430', background: 'linear-gradient(135deg,#f0f3ff 0%,#e7eefe 100%)' }}>
      <div style={{ padding: '20px 24px 48px' }}>{body}</div>
      {drawer}
    </div>
  )

  // Pointer-drag on a milestone: preview while moving, one PATCH on release.
  function beginDrag(post: PostDTO, startX: number) {
    setDrag({ id: post.id, days: 0 })
    const move = (ev: PointerEvent) => {
      setDrag((d) => (d ? { ...d, days: Math.round((ev.clientX - startX) / DAY_W) } : d))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const dayDelta = Math.round((ev.clientX - startX) / DAY_W)
      setDrag(null)
      if (dayDelta !== 0) commitDrag(post, dayDelta)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
}

// ---------------------------------------------------------------------------
// list row
// ---------------------------------------------------------------------------

function PostRow({
  post, selected, onSelect, onOpen, onPatch, onDelete,
}: {
  post: PostDTO
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onPatch: (id: string, patch: Record<string, unknown>, optimistic?: Partial<PostDTO>) => void
  onDelete: () => void
}) {
  const overdue = isOverdue(post)
  const meta = statusMeta(post.status)

  return (
    <div
      className="grid items-center group"
      onClick={onSelect}
      style={{ gridTemplateColumns: LIST_COLS, height: ROW_H, padding: '0 16px',
        borderTop: '1px solid #f2f5fa', background: selected ? '#f0f4fd' : '#fff', cursor: 'pointer',
        boxShadow: selected ? `inset 3px 0 0 ${ACCENT}` : 'none' }}
    >
      {/* item + thread bubble */}
      <div className="flex items-center gap-2 min-w-0 pr-3">
        <button
          onClick={(e) => { e.stopPropagation(); onOpen() }}
          className="min-w-0 text-left"
          style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
          title="Open the draft and work on it with Peacock"
        >
          <span dir="auto" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: '#2b2f3a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {post.title}
          </span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen() }}
          title={post.commentCount ? `${post.commentCount} messages with Peacock` : 'Discuss this post with Peacock'}
          className="flex items-center gap-1 shrink-0"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer',
            color: post.commentCount ? ACCENT : '#cbd0da', padding: 0 }}
        >
          {post.commentCount ? <MessageSquare size={15} /> : <MessageSquarePlus size={15} />}
          {post.commentCount > 0 && <span style={{ fontSize: 11, fontWeight: 800 }}>{post.commentCount}</span>}
        </button>
      </div>

      {/* status */}
      <div onClick={(e) => e.stopPropagation()} className="pr-3">
        <Dropdown
          trigger={
            <span className="flex items-center justify-center gap-1"
              style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: meta.color,
                padding: '5px 9px', borderRadius: 7, minWidth: 118, whiteSpace: 'nowrap' }}>
              {meta.label}
            </span>
          }
          items={STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label, color: STATUS_META[s].color }))}
          activeKey={post.status}
          onPick={(key) => onPatch(post.id, { status: key }, { status: key as PostStatus })}
        />
      </div>

      {/* publish date */}
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {overdue && <AlertCircle size={14} style={{ color: '#e2445c', flex: 'none' }} />}
        <DateCell
          value={post.publishDate}
          onChange={(iso) => onPatch(post.id, { publishDate: iso }, { publishDate: iso ? new Date(iso).toISOString() : null })}
        />
      </div>

      {/* post type */}
      <div className="flex items-center pr-2" onClick={(e) => e.stopPropagation()}>
        <Dropdown
          trigger={
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: typeColor(post.postType),
              padding: '5px 9px', borderRadius: 7, whiteSpace: 'nowrap', opacity: post.postType ? 1 : 0.45 }}>
              {post.postType ?? 'Set type'}
            </span>
          }
          items={POST_TYPES.map((t) => ({ key: t, label: t, color: typeColor(t) }))}
          activeKey={post.postType ?? ''}
          onPick={(key) => onPatch(post.id, { postType: key }, { postType: key })}
        />
      </div>

      {/* source — read-only: it records where the post came from, and making
          that editable would just be rewriting history */}
      <div className="flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
        <SourceChip source={post.source} sourceUrl={post.sourceUrl} sourceName={post.sourceName} />
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${post.title}"?`)) onDelete() }}
          title="Delete post"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#cbd0da', fontSize: 15, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

/**
 * Provenance chip. Outlined rather than filled, so Source reads as reference
 * and stays visually behind Status and PostType — the two columns that are
 * actually controls. A newsletter post links straight to the article behind it.
 */
function SourceChip({
  source, sourceUrl, sourceName,
}: {
  source: PostSource
  sourceUrl: string | null
  sourceName: string | null
}) {
  const m = sourceMeta(source)
  const title = sourceName ? `${m.hint} — ${sourceName}` : m.hint
  const chip = (
    <span
      style={{ fontSize: 11, fontWeight: 700, color: m.color, background: `${m.color}12`,
        border: `1px solid ${m.color}3d`, padding: '4px 8px', borderRadius: 7, whiteSpace: 'nowrap' }}
    >
      {m.short}
    </span>
  )
  if (source === 'newsletter' && sourceUrl) {
    return (
      <a href={sourceUrl} target="_blank" rel="noreferrer" title={`${title} — open the source`} style={{ textDecoration: 'none' }}>
        {chip}
      </a>
    )
  }
  return <span title={title}>{chip}</span>
}

function DateCell({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value ? isoDay(new Date(value)) : ''}
        onBlur={(e) => { setEditing(false); onChange(e.target.value || null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        style={{ fontSize: 12.5, fontFamily: 'inherit', border: `1px solid ${ACCENT}`, borderRadius: 7, padding: '3px 5px', outline: 'none', width: 118 }}
      />
    )
  }
  return (
    <button onClick={() => setEditing(true)} title="Set publish date"
      style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12.5, fontWeight: 600, color: value ? '#5a5f6e' : '#c0c4ce', padding: '3px 0' }}>
      {value ? fmtDayMon(value) : 'no date'}
    </button>
  )
}

interface DropdownItem { key: string; label: string; color?: string }

function Dropdown({
  trigger, items, activeKey, onPick,
}: {
  trigger: React.ReactNode
  items: DropdownItem[]
  activeKey: string
  onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
        {trigger}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 5, zIndex: 40, minWidth: 178,
          background: '#fff', border: '1px solid #e7ebf5', borderRadius: 12, boxShadow: '0 12px 30px rgba(30,36,140,.16)', padding: 5, maxHeight: 280, overflowY: 'auto' }}>
          {items.map((it) => (
            <button key={it.key} onClick={() => { onPick(it.key); setOpen(false) }}
              className="flex items-center gap-2 w-full text-left"
              style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                background: it.key === activeKey ? '#eef3fe' : 'transparent', color: it.key === activeKey ? ACCENT : '#4b5060' }}>
              {it.color && <span style={{ width: 9, height: 9, borderRadius: 3, background: it.color, flex: 'none' }} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// gantt row
// ---------------------------------------------------------------------------

function GanttRow({
  post, days, rangeStart, totalDays, selected, drag, onSelect, onOpen, onDragStart,
}: {
  post: PostDTO
  days: Date[]
  rangeStart: Date
  totalDays: number
  selected: boolean
  drag: DragState | null
  onSelect: () => void
  onOpen: () => void
  onDragStart: (startX: number) => void
}) {
  const meta = statusMeta(post.status)
  const movedRef = useRef(false)

  // A post is a single milestone on its publish day — no drafting window, so no
  // start/due span. `left` is the centre of that day's column, with the
  // in-flight drag applied as a preview. Returns an `outside` marker instead of
  // null for a dated post beyond the window, so a scheduled post never renders
  // as an unexplained empty row.
  const geo = useMemo(() => {
    if (!post.publishDate) return null
    const publishIdx = daysBetween(rangeStart, new Date(post.publishDate)) + (drag?.days ?? 0)
    if (publishIdx < 0) return { outside: 'before' as const }
    if (publishIdx > totalDays - 1) return { outside: 'after' as const }
    return { left: publishIdx * DAY_W + DAY_W / 2 }
  }, [post.publishDate, rangeStart, totalDays, drag])

  const milestone = geo && !('outside' in geo) ? geo : null
  const outside = geo && 'outside' in geo ? geo.outside : null

  return (
    <div
      onClick={onSelect}
      style={{ height: ROW_H, borderTop: '1px solid #f2f5fa', position: 'relative',
        background: selected ? '#f0f4fd' : 'transparent', cursor: 'pointer' }}
    >
      {/* day grid */}
      <div className="flex" style={{ height: '100%' }}>
        {days.map((d) => {
          const weekend = d.getDay() === 5 || d.getDay() === 6
          return (
            <div key={d.toISOString()}
              style={{ width: DAY_W, flex: 'none', height: '100%',
                background: weekend && !selected ? '#f7f9fd' : 'transparent',
                borderLeft: d.getDay() === 0 ? '1px solid #e7ebf5' : 'none' }} />
          )
        })}
      </div>

      {!post.publishDate && (
        <span style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)',
          fontSize: 11, color: '#c6cad4', fontWeight: 600, pointerEvents: 'none' }}>
          no date — set one to place it on the timeline
        </span>
      )}

      {/* dated, but beyond the visible window — say so, and stay clickable */}
      {outside && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpen() }}
          title={`${post.title} · publish ${fmtDayMon(post.publishDate)} — outside the visible range`}
          style={{ position: 'absolute', top: 11, height: ROW_H - 22,
            [outside === 'before' ? 'left' : 'right']: 6,
            display: 'flex', alignItems: 'center', gap: 4, paddingInline: 8, borderRadius: 8,
            border: `1px dashed ${meta.color}80`, background: `${meta.color}14`, color: meta.color,
            fontSize: 10.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', zIndex: 3 }}
        >
          {outside === 'before' ? '←' : ''} {fmtDayMon(post.publishDate)} {outside === 'after' ? '→' : ''}
        </button>
      )}

      {milestone && (
        <div
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            movedRef.current = false
            const startX = e.clientX
            const onMove = (ev: PointerEvent) => { if (Math.abs(ev.clientX - startX) > 3) movedRef.current = true }
            const onUp = () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
              if (!movedRef.current) onOpen() // a click, not a drag
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
            onDragStart(startX)
          }}
          title={`${post.title} · ${meta.label} · publish ${fmtDayMon(post.publishDate)}\nDrag to reschedule`}
          // Anchored at the day's centre and laid out rightwards, so the diamond
          // sits exactly on its column while the title reads alongside it.
          style={{ position: 'absolute', top: 0, height: ROW_H, left: milestone.left,
            display: 'flex', alignItems: 'center', gap: 6, paddingInlineEnd: 10,
            cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', zIndex: drag ? 5 : 3 }}
        >
          <span style={{ width: 13, height: 13, background: meta.color, transform: 'translateX(-50%) rotate(45deg)',
            flex: 'none', borderRadius: 2, pointerEvents: 'none',
            boxShadow: drag ? '0 4px 12px rgba(30,36,140,.30)' : '0 1px 3px rgba(30,36,140,.20)' }} />
          <span dir="auto" style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginInlineStart: -3,
            whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {post.title}
          </span>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-2" style={{ marginTop: 14, paddingInline: 4 }}>
      {STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: '#8b909c', fontWeight: 600 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: STATUS_META[s].color }} />
          {STATUS_META[s].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: '#8b909c', fontWeight: 600, marginInlineStart: 'auto' }}>
        <span style={{ width: 9, height: 9, background: '#8b909c', transform: 'rotate(45deg)' }} /> publish date
      </span>
    </div>
  )
}
