'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Send, Square, Sparkles, Copy, Check, Code2, Eye, Trash2, ExternalLink,
  Image as ImageIcon, CalendarClock, Newspaper, BarChart3,
} from 'lucide-react'
import MarkdownView from './Markdown'
import {
  bodyToPlainText, engagementRate, engagementTotal, initials, isoDay, POST_TYPES, PortalUser,
  PostDTO, PostMetrics, PostStatus, PURPLE, PURPLE_2, STATUS_META, STATUS_ORDER, statusMeta, typeColor,
} from './postMeta'

interface Msg { id: string; role: string; content: string }

const SUGGESTIONS = [
  'כתוב טיוטה ראשונה לפוסט הזה',
  'תקצר ב-30% ותחדד את ה-Hook',
  'הוסף דוגמה קונקרטית מהשטח',
  'מוכן לאישור — העבר ל-Pending Approval',
]

/**
 * One post, open for work: the draft on the left (editable, and updated live by
 * Peacock), the post's own Peacock thread on the right. This is what replaced
 * clicking into a Monday item and reading its Updates column.
 */
export default function PostDrawer({
  agentKey, post, users, onClose, onPostChanged, onPatch, onDelete,
}: {
  agentKey: string
  post: PostDTO
  users: PortalUser[]
  onClose: () => void
  onPostChanged: (p: PostDTO) => void
  onPatch: (id: string, patch: Record<string, unknown>, optimistic?: Partial<PostDTO>) => void
  onDelete: () => void
}) {
  const [p, setP] = useState<PostDTO>(post)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'preview' | 'html'>('preview')
  const [bodyLoaded, setBodyLoaded] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Follow the parent when the row is patched from the list/timeline — but the
  // parent's rows are slim, so never let a body-less row wipe the loaded draft.
  useEffect(() => {
    setP((cur) => {
      if (post.id !== cur.id) return post
      if (post.updatedAt < cur.updatedAt) return cur
      return { ...post, body: post.body ?? cur.body, notes: post.notes ?? cur.notes }
    })
  }, [post])

  useEffect(() => {
    setLoaded(false)
    setMessages([])
    fetch(`/api/dashboard/${agentKey}/posts/${post.id}/chat`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [agentKey, post.id])

  // The board list is fetched slim (no bodies) — pull the full draft on open.
  useEffect(() => {
    setBodyLoaded(false)
    fetch(`/api/dashboard/${agentKey}/posts/${post.id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.post) setP(d.post) })
      .catch(() => {})
      .finally(() => setBodyLoaded(true))
  }, [agentKey, post.id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  /** Apply a field edit locally, then persist through the parent's optimistic PATCH. */
  const edit = useCallback((patch: Partial<PostDTO> & Record<string, unknown>) => {
    setP((cur) => ({ ...cur, ...patch }))
    onPatch(post.id, patch, patch)
  }, [onPatch, post.id])

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    setMessages((m) => [...m, { id: `tmp-${m.length}`, role: 'user', content: msg }])
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/posts/${post.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        setMessages((m) => [...m, data.reply])
        // Peacock may have rewritten the draft inside the turn.
        if (data.post) { setP(data.post); onPostChanged(data.post) }
      } else {
        setMessages((m) => [...m, { id: `err-${m.length}`, role: 'assistant', content: `⚠️ ${data.error ?? 'Something went wrong'}` }])
      }
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError'
      setMessages((m) => [...m, {
        id: `err-${m.length}`, role: 'assistant',
        content: aborted ? '⏹️ נעצר.' : '⚠️ Network error — try again.',
      }])
    } finally {
      setSending(false)
      abortRef.current = null
      requestAnimationFrame(() => taRef.current?.focus())
    }
  }

  async function copyForLinkedIn() {
    try {
      await navigator.clipboard.writeText(bodyToPlainText(p.body ?? ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard unavailable */ }
  }

  const meta = statusMeta(p.status)
  const owner = users.find((u) => u.id === p.ownerUserId)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ fontFamily: "'Manrope','Assistant',system-ui,sans-serif" }}>
      <div className="flex-1" onClick={onClose} style={{ background: 'rgba(30,25,60,.34)', backdropFilter: 'blur(2px)' }} />

      <div className="flex flex-col h-full" style={{ width: 'min(1180px, 96vw)', background: '#fff', boxShadow: '-18px 0 50px rgba(50,35,120,.20)' }}>
        {/* header */}
        <div className="flex items-center gap-3 shrink-0" style={{ padding: '13px 18px', borderBottom: '1px solid #f0eef8' }}>
          <span style={{ fontSize: 22 }}>🦚</span>
          <input
            value={p.title}
            dir="auto"
            onChange={(e) => setP((cur) => ({ ...cur, title: e.target.value }))}
            onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== post.title) edit({ title: t }) }}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 17, fontWeight: 800,
              letterSpacing: '-.01em', color: '#1f2430', fontFamily: 'inherit', background: 'transparent' }}
          />
          <button onClick={onClose} title="Close (Esc)" className="flex items-center justify-center shrink-0"
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #eeecf6', background: '#fff', color: '#9aa0ac', cursor: 'pointer' }}>
            <X size={17} />
          </button>
        </div>

        {/* meta strip */}
        <div className="flex items-center gap-2 flex-wrap shrink-0" style={{ padding: '10px 18px', borderBottom: '1px solid #f4f2fa', background: '#fcfbff' }}>
          <Select
            value={p.status}
            options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))}
            onChange={(v) => edit({ status: v as PostStatus })}
            style={{ background: meta.color, color: '#fff', fontWeight: 700 }}
          />
          <Select
            value={p.postType ?? ''}
            options={[{ value: '', label: 'Set type' }, ...POST_TYPES.map((t) => ({ value: t, label: t }))]}
            onChange={(v) => edit({ postType: v || null })}
            style={{ background: typeColor(p.postType), color: '#fff', fontWeight: 700, opacity: p.postType ? 1 : 0.5 }}
          />
          <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: '#8b909c', fontWeight: 600 }}>
            <CalendarClock size={14} /> publish
            <input
              type="date"
              value={p.publishDate ? isoDay(new Date(p.publishDate)) : ''}
              onChange={(e) => edit({ publishDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
              style={{ fontSize: 12.5, fontFamily: 'inherit', border: '1px solid #e7e3f7', borderRadius: 8, padding: '5px 7px', outline: 'none', color: '#4b5060' }}
            />
          </label>
          <Select
            value={p.ownerUserId ?? ''}
            options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            onChange={(v) => {
              const u = users.find((x) => x.id === v)
              edit({ ownerUserId: v || null, ownerName: u?.name ?? null, ownerImageUrl: u?.imageUrl ?? null })
            }}
            style={{ background: '#f0ecff', color: PURPLE, fontWeight: 700 }}
            prefix={owner?.imageUrl ? undefined : initials(p.ownerName)}
          />
          {p.projectNumber && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#5a5f6e', background: '#f2f1f8', padding: '5px 9px', borderRadius: 7 }}>
              project #{p.projectNumber}
            </span>
          )}
          <button onClick={() => { if (confirm(`Delete "${p.title}"?`)) onDelete() }}
            title="Delete post" className="flex items-center gap-1.5"
            style={{ marginInlineStart: 'auto', border: '1px solid #f6dfe2', background: '#fff', color: '#e2445c',
              borderRadius: 9, padding: '6px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <Trash2 size={13} /> Delete
          </button>
        </div>

        {/* body: draft | chat */}
        <div className="flex-1 grid min-h-0" style={{ gridTemplateColumns: 'minmax(0,1.12fr) minmax(0,1fr)' }}>
          {/* ---- draft ---- */}
          <div className="flex flex-col min-h-0" style={{ borderRight: '1px solid #f0eef8' }}>
            <div className="flex items-center gap-2 shrink-0" style={{ padding: '9px 16px', borderBottom: '1px solid #f6f5fb' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#5a5f6e' }}>Draft</span>
              <div className="flex items-center" style={{ background: '#f5f4fa', borderRadius: 9, padding: 2, marginInlineStart: 6 }}>
                <ModeButton active={mode === 'preview'} onClick={() => setMode('preview')} icon={<Eye size={13} />} label="Preview" />
                <ModeButton active={mode === 'html'} onClick={() => setMode('html')} icon={<Code2 size={13} />} label="HTML" />
              </div>
              <button onClick={copyForLinkedIn} disabled={!p.body} className="flex items-center gap-1.5"
                style={{ marginInlineStart: 'auto', border: '1px solid #e7e3f7', background: '#fff', color: copied ? '#16a34a' : PURPLE,
                  borderRadius: 9, padding: '6px 10px', fontSize: 12.5, fontWeight: 700, cursor: p.body ? 'pointer' : 'not-allowed', opacity: p.body ? 1 : 0.45 }}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy for LinkedIn'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ padding: '16px 18px' }}>
              {!bodyLoaded ? (
                <p style={{ fontSize: 12.5, color: '#a9adb8', textAlign: 'center', marginTop: 20 }}>Loading draft…</p>
              ) : mode === 'preview' ? (
                p.body ? (
                  <div
                    dir="rtl"
                    style={{ fontSize: 14.5, lineHeight: 1.75, color: '#2b2f3a', whiteSpace: 'pre-wrap' }}
                    // The draft is Peacock's own stored HTML (RTL markup it authored), rendered back for review.
                    dangerouslySetInnerHTML={{ __html: p.body }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center h-full" style={{ color: '#a9adb8' }}>
                    <span style={{ fontSize: 30 }}>🦚</span>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#5a5f6e', marginTop: 10 }}>No draft yet</p>
                    <p style={{ fontSize: 13, marginTop: 4, maxWidth: 280 }}>
                      Ask Peacock on the right to write the first version — it appears here.
                    </p>
                  </div>
                )
              ) : (
                <textarea
                  value={p.body ?? ''}
                  dir="auto"
                  onChange={(e) => setP((cur) => ({ ...cur, body: e.target.value }))}
                  onBlur={(e) => { if (e.target.value !== (post.body ?? '')) edit({ body: e.target.value }) }}
                  placeholder='<div dir="rtl">…</div>'
                  style={{ width: '100%', minHeight: '100%', border: '1px solid #eeecf6', borderRadius: 12, padding: 12,
                    fontSize: 13, lineHeight: 1.6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', outline: 'none', resize: 'none' }}
                />
              )}
            </div>

            {/* draft footer: source, image, linkedin link, performance */}
            <div className="shrink-0" style={{ borderTop: '1px solid #f6f5fb', background: '#fcfbff' }}>
              {p.sourceUrl && (
                <div className="flex items-center gap-2" style={{ padding: '8px 16px 0', fontSize: 11.5, color: '#a9adb8' }}>
                  <Newspaper size={13} style={{ flex: 'none' }} />
                  based on{' '}
                  <a href={p.sourceUrl} target="_blank" rel="noreferrer"
                    style={{ color: PURPLE, fontWeight: 700, textDecoration: 'none' }}>
                    {p.sourceName ?? 'newsletter topic'}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-3" style={{ padding: '10px 16px' }}>
                {p.imageUrl ? (
                  <a href={p.imageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5"
                    style={{ fontSize: 12.5, fontWeight: 700, color: PURPLE }}>
                    <ImageIcon size={14} /> Cover image <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: '#b0aebc', fontWeight: 600 }}>
                    <ImageIcon size={14} /> no cover image yet
                  </span>
                )}
                <input
                  value={p.linkedinUrl ?? ''}
                  onChange={(e) => setP((cur) => ({ ...cur, linkedinUrl: e.target.value }))}
                  onBlur={(e) => { if (e.target.value !== (post.linkedinUrl ?? '')) edit({ linkedinUrl: e.target.value || null }) }}
                  placeholder="LinkedIn URL once published…"
                  style={{ marginInlineStart: 'auto', width: 260, fontSize: 12.5, fontFamily: 'inherit',
                    border: '1px solid #eeecf6', borderRadius: 9, padding: '6px 9px', outline: 'none', color: '#4b5060' }}
                />
              </div>

              <PerformanceRow metrics={p.metrics} onSave={(metrics) => edit({ metrics })} />
            </div>
          </div>

          {/* ---- chat ---- */}
          <div className="flex flex-col min-h-0" style={{ background: 'linear-gradient(180deg,#fbfaff 0%,#f7f5fd 100%)' }}>
            <div className="flex items-center gap-2 shrink-0" style={{ padding: '9px 16px', borderBottom: '1px solid #f0eef8' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#5a5f6e' }}>Work on it with Peacock</span>
              <span style={{ fontSize: 11.5, color: '#a9adb8', marginInlineStart: 'auto' }}>
                this thread stays on the post
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: '14px 16px' }}>
              {!loaded ? (
                <p style={{ fontSize: 12.5, color: '#a9adb8', textAlign: 'center', marginTop: 20 }}>Loading…</p>
              ) : messages.length === 0 ? (
                <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 13, color: '#8b909c', marginBottom: 4 }}>
                    Tell Peacock what this post should say, or ask it to fix the draft.
                  </p>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} dir="auto"
                      style={{ textAlign: 'start', fontSize: 12.5, fontWeight: 600, padding: '9px 12px', borderRadius: 11,
                        border: `1px solid ${PURPLE}2e`, background: 'rgba(255,255,255,.7)', color: PURPLE, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {messages.map((m) => {
                    const isUser = m.role === 'user'
                    return (
                      <div key={m.id} className={`max-w-[88%] ${isUser ? 'self-end' : 'self-start'}`}
                        style={{ borderRadius: 16, padding: '10px 13px',
                          background: isUser ? `${PURPLE}1c` : '#fff',
                          boxShadow: isUser ? 'none' : '0 2px 8px rgba(90,70,180,.06)' }}>
                        {isUser ? (
                          <p dir="auto" style={{ fontSize: 13.5, lineHeight: 1.6, color: '#3a3f4d', whiteSpace: 'pre-wrap', margin: 0 }}>{m.content}</p>
                        ) : (
                          <MarkdownView content={m.content} accent={PURPLE} />
                        )}
                      </div>
                    )
                  })}
                  {sending && (
                    <div className="self-start flex items-center gap-1.5" style={{ borderRadius: 16, padding: '10px 13px', background: '#fff' }}>
                      <Sparkles size={13} className="animate-pulse" style={{ color: PURPLE }} />
                      <span style={{ fontSize: 12, color: '#a9adb8' }}>עובד על הטיוטה…</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); send(input) }}
              className="flex items-end gap-2 shrink-0"
              style={{ padding: '11px 14px', borderTop: '1px solid #f0eef8', background: 'rgba(255,255,255,.6)' }}
            >
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) }
                }}
                placeholder="מה לשנות בפוסט הזה?"
                dir="auto"
                rows={1}
                style={{ flex: 1, fontSize: 13.5, padding: '11px 13px', borderRadius: 14, border: '1px solid #e7e3f7',
                  outline: 'none', background: '#fff', resize: 'none', maxHeight: 130, fontFamily: 'inherit', lineHeight: 1.55 }}
              />
              {sending ? (
                <button type="button" onClick={() => abortRef.current?.abort()} title="עצור"
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 42, height: 42, borderRadius: 14, border: 'none', background: '#ef4444', cursor: 'pointer' }}>
                  <Square size={14} color="#fff" fill="#fff" />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} title="שלח (Enter)"
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 42, height: 42, borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})`, opacity: input.trim() ? 1 : 0.4 }}>
                  <Send size={16} color="#fff" />
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

const METRIC_FIELDS: { key: keyof PostMetrics; label: string }[] = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'reactions', label: 'Reactions' },
  { key: 'comments', label: 'Comments' },
  { key: 'reposts', label: 'Reposts' },
]

/**
 * Type in what LinkedIn reports for this post. This is the path that works with
 * no API access at all — open the post on LinkedIn, copy the four numbers across.
 * The sync overwrites these once the org is connected (source flips to 'linkedin').
 */
function PerformanceRow({ metrics, onSave }: { metrics: PostMetrics | null; onSave: (m: PostMetrics) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(
      Object.fromEntries(
        METRIC_FIELDS.map(({ key }) => [key, metrics?.[key] != null ? String(metrics[key]) : ''])
      )
    )
  }, [metrics])

  const parsed: PostMetrics = Object.fromEntries(
    METRIC_FIELDS.map(({ key }) => [key, draft[key]?.trim() ? Number(draft[key]) : undefined]).filter(
      ([, v]) => v !== undefined && Number.isFinite(v as number)
    )
  )
  const dirty = METRIC_FIELDS.some(({ key }) => (parsed[key] ?? null) !== (metrics?.[key] ?? null))
  const rate = engagementRate({ ...parsed })

  function save() {
    onSave({ ...parsed, source: 'manual', syncedAt: new Date().toISOString() })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div className="flex items-end gap-3 flex-wrap" style={{ padding: '10px 16px 12px', borderTop: '1px solid #f4f2fa' }}>
      <span className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 800, color: '#5a5f6e', paddingBottom: 6 }}>
        <BarChart3 size={13} /> Performance
      </span>

      {METRIC_FIELDS.map(({ key, label }) => (
        <label key={key} className="flex flex-col" style={{ gap: 3 }}>
          <span style={{ fontSize: 10.5, color: '#a9adb8', fontWeight: 600 }}>{label}</span>
          <input
            value={draft[key] ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value.replace(/[^\d]/g, '') }))}
            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save() }}
            inputMode="numeric"
            placeholder="—"
            style={{ width: 72, fontSize: 12.5, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
              border: '1px solid #eeecf6', borderRadius: 8, padding: '5px 7px', outline: 'none', color: '#3a3f4d' }}
          />
        </label>
      ))}

      {engagementTotal(parsed) > 0 && rate != null && (
        <span style={{ fontSize: 11.5, color: '#a9adb8', paddingBottom: 6 }}>
          {engagementTotal(parsed).toLocaleString('en-US')} engagements · {rate.toFixed(1)}%
        </span>
      )}

      <button
        onClick={save}
        disabled={!dirty}
        style={{ marginInlineStart: 'auto', border: 'none', borderRadius: 9, padding: '7px 12px', fontSize: 12.5,
          fontWeight: 700, fontFamily: 'inherit', cursor: dirty ? 'pointer' : 'default',
          background: dirty ? `linear-gradient(135deg,${PURPLE},${PURPLE_2})` : '#f2f1f8',
          color: dirty ? '#fff' : '#b0aebc' }}
      >
        {saved ? 'Saved' : 'Save'}
      </button>

      {metrics?.source && (
        <span style={{ fontSize: 10.5, color: '#c0c4ce', width: '100%' }}>
          {metrics.source === 'linkedin' ? 'synced from LinkedIn' : metrics.source === 'import' ? 'from import' : 'entered by hand'}
          {metrics.syncedAt ? ` · ${new Date(metrics.syncedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
        </span>
      )}
    </div>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5"
      style={{ border: 'none', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 700, background: active ? '#fff' : 'transparent', color: active ? PURPLE : '#9aa0ac',
        boxShadow: active ? '0 1px 4px rgba(90,70,180,.12)' : 'none' }}>
      {icon} {label}
    </button>
  )
}

/** A styled native select — keeps the meta strip compact and keyboard-friendly. */
function Select({
  value, options, onChange, style, prefix,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  style?: React.CSSProperties
  prefix?: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ borderRadius: 8, padding: '2px 4px 2px 8px', ...style }}>
      {prefix && <span style={{ fontSize: 10.5, fontWeight: 800, opacity: 0.85 }}>{prefix}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 'inherit',
          fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', padding: '4px 2px' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ color: '#1f2430', fontWeight: 600 }}>{o.label}</option>
        ))}
      </select>
    </span>
  )
}
