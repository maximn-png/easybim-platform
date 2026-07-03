'use client'

import { useEffect, useRef, useState } from 'react'
import type { Components } from 'react-markdown'
import { Send, Sparkles, Square, Copy, Check, Maximize2, X, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { ChatCopy } from '@/lib/agents/presentation'

interface Msg {
  id: string
  role: string
  content: string
}

const MAX_TEXTAREA_PX = 140

// Parse a GFM markdown table's source into headers + raw-cell rows.
function parseMarkdownTable(src: string): { headers: string[]; rows: string[][] } {
  const lines = src
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  const parseRow = (l: string) =>
    l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const rowsRaw = lines.map(parseRow)
  const isSep = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))
  const headers = rowsRaw[0] ?? []
  const rows = rowsRaw.slice(1).filter((r) => !isSep(r))
  return { headers, rows }
}

// Stash a table (structured) in localStorage and open it in the standalone /table page.
function openTablePage(src: string) {
  const { headers, rows } = parseMarkdownTable(src)
  if (!headers.length) return
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  try {
    localStorage.setItem(`squirrel-table-${id}`, JSON.stringify({ headers, rows }))
    window.open(`/table?id=${id}`, '_blank')
  } catch {
    /* localStorage unavailable */
  }
}

// Markdown component set. `large` bumps sizing for the popped-out modal view.
// `onExpandTable` (when set) makes each table clickable → opens the modal.
function mdComponents(opts: {
  accent: string
  large?: boolean
  content?: string
  onExpandTable?: (src: string) => void
}): Components {
  const { accent, large, content, onExpandTable } = opts
  const cell = large ? 'px-4 py-2.5 text-sm' : 'px-2.5 py-1.5 text-xs'
  return {
    table: ({ children, node }) => {
      // Slice this table's markdown source (via mdast offsets) for the modal.
      const pos = (node as { position?: { start?: { offset?: number }; end?: { offset?: number } } })?.position
      const src =
        content && pos?.start?.offset != null && pos?.end?.offset != null
          ? content.slice(pos.start.offset, pos.end.offset)
          : null
      const clickable = !!(src && onExpandTable)
      return (
        <div className={large ? 'relative' : 'my-2 relative group'}>
          <div
            className="overflow-x-auto rounded-lg border"
            style={{ borderColor: 'rgba(0,0,0,0.08)', cursor: clickable ? 'zoom-in' : 'default' }}
            onClick={clickable ? () => onExpandTable!(src!) : undefined}
          >
            <table className={`w-full border-collapse ${large ? 'text-sm' : 'text-xs'}`}>{children}</table>
          </div>
          {clickable && (
            <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                type="button"
                title="הגדל טבלה"
                aria-label="Expand table"
                onClick={(e) => {
                  e.stopPropagation()
                  onExpandTable!(src!)
                }}
                className="bg-white/90 border rounded-md p-1 shadow-sm"
                style={{ borderColor: 'rgba(0,0,0,0.1)' }}
              >
                <Maximize2 size={13} style={{ color: accent }} />
              </button>
              <button
                type="button"
                title="פתח בעמוד חדש (מיון וייצוא CSV)"
                aria-label="Open in new page"
                onClick={(e) => {
                  e.stopPropagation()
                  openTablePage(src!)
                }}
                className="bg-white/90 border rounded-md p-1 shadow-sm"
                style={{ borderColor: 'rgba(0,0,0,0.1)' }}
              >
                <ExternalLink size={13} style={{ color: accent }} />
              </button>
            </div>
          )}
        </div>
      )
    },
    th: ({ children }) => (
      <th
        className={`${cell} font-semibold text-start border-b`}
        style={{ background: `${accent}12`, color: '#111827', borderColor: 'rgba(0,0,0,0.08)' }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`${cell} align-top border-b`} style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        {children}
      </td>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        style={{ color: accent }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    ),
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc mb-2 space-y-0.5" style={{ paddingInlineStart: '1.25rem' }}>{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal mb-2 space-y-0.5" style={{ paddingInlineStart: '1.25rem' }}>{children}</ol>,
    strong: ({ children }) => <strong className="font-semibold" style={{ color: '#111827' }}>{children}</strong>,
    code: ({ children }) => (
      <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'rgba(0,0,0,0.06)' }}>{children}</code>
    ),
    h1: ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
    h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
    h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  }
}

// Render an assistant message as rich markdown; tables pop out into a large modal on click.
function MarkdownView({ content, accent }: { content: string; accent: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <div className="text-sm leading-relaxed" style={{ color: '#374151' }} dir="auto">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents({ accent, content, onExpandTable: setExpanded })}>
        {content}
      </ReactMarkdown>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(17,24,39,0.55)' }}
          onClick={() => setExpanded(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-auto p-5"
            style={{ maxWidth: '95vw', maxHeight: '90vh' }}
            dir="auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2 gap-2">
              <button
                type="button"
                onClick={() => openTablePage(expanded)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors hover:bg-black/5"
                style={{ borderColor: `${accent}44`, color: accent }}
              >
                <ExternalLink size={13} /> פתח בעמוד (מיון + CSV)
              </button>
              <button
                type="button"
                onClick={() => setExpanded(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 hover:bg-black/5 transition-colors"
              >
                <X size={18} style={{ color: '#6b7280' }} />
              </button>
            </div>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents({ accent, large: true })}>
              {expanded}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Chat({
  agentKey,
  accent,
  emoji,
  copy,
}: {
  agentKey: string
  accent: string
  emoji: string
  copy: ChatCopy
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch(`/api/dashboard/${agentKey}/chat`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [agentKey])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  // Auto-grow the textarea to fit its content (capped).
  function autoGrow() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_PX)}px`
  }
  useEffect(autoGrow, [input])

  async function copyMessage(m: Msg) {
    try {
      await navigator.clipboard.writeText(m.content)
      setCopiedId(m.id)
      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    const optimistic: Msg = { id: `tmp-${messages.length}`, role: 'user', content: msg }
    setMessages((m) => [...m, optimistic])
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        setMessages((m) => [...m, data.reply])
      } else {
        setMessages((m) => [...m, { id: `err-${m.length}`, role: 'assistant', content: `⚠️ ${data.error ?? 'Something went wrong'}` }])
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setMessages((m) => [...m, { id: `stop-${m.length}`, role: 'assistant', content: '⏹️ נעצר.' }])
      } else {
        setMessages((m) => [...m, { id: `err-${m.length}`, role: 'assistant', content: '⚠️ Network error — try again.' }])
      }
    } finally {
      setSending(false)
      abortRef.current = null
      requestAnimationFrame(() => taRef.current?.focus())
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline. Ignore Enter mid-IME-composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <section className="rounded-2xl bg-white/55 backdrop-blur-sm border border-white/90 shadow-sm overflow-hidden flex flex-col" style={{ height: 460 }}>
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        <span className="text-lg">{emoji}</span>
        <div>
          <p className="text-sm font-bold" style={{ color: '#111827' }}>{copy.title}</p>
          <p className="text-[11px]" style={{ color: '#9ca3af' }}>{copy.subtitle}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {!loaded ? (
          <p className="text-xs text-center my-auto" style={{ color: '#9ca3af' }}>Loading…</p>
        ) : messages.length === 0 ? (
          <div className="my-auto text-center">
            <span className="text-2xl">{emoji}</span>
            <p className="text-sm font-semibold mt-2" style={{ color: '#6b7280' }}>{copy.emptyTitle}</p>
            <p className="text-xs mt-1 mb-3" style={{ color: '#9ca3af' }}>{copy.emptyHint}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {copy.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:bg-white/60"
                  style={{ borderColor: `${accent}33`, color: accent }}
                  dir="auto"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user'
            return (
              <div key={m.id} className={`group relative max-w-[85%] ${isUser ? 'self-end' : 'self-start'}`}>
                <div
                  className="rounded-2xl px-3.5 py-2.5 break-words"
                  style={{ background: isUser ? 'rgba(68,184,211,0.14)' : `${accent}0f` }}
                >
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#374151' }} dir="auto">
                      {m.content}
                    </p>
                  ) : (
                    <MarkdownView content={m.content} accent={accent} />
                  )}
                </div>
                <button
                  onClick={() => copyMessage(m)}
                  title="העתק"
                  aria-label="Copy message"
                  className={`absolute -bottom-2 ${isUser ? 'left-1' : 'right-1'} opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 border rounded-md p-1 shadow-sm`}
                  style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                >
                  {copiedId === m.id ? (
                    <Check size={12} style={{ color: '#22c55e' }} />
                  ) : (
                    <Copy size={12} style={{ color: '#9ca3af' }} />
                  )}
                </button>
              </div>
            )
          })
        )}
        {sending && (
          <div className="self-start rounded-2xl px-3.5 py-2.5 inline-flex items-center gap-1.5" style={{ background: `${accent}0f` }}>
            <Sparkles size={13} className="animate-pulse" style={{ color: accent }} />
            <span className="text-xs" style={{ color: '#9ca3af' }}>{copy.thinking}</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="p-3 border-t flex items-end gap-2"
        style={{ borderColor: 'rgba(0,0,0,0.05)' }}
      >
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={copy.placeholder}
          dir="auto"
          rows={1}
          className="flex-1 text-sm px-3.5 py-2.5 rounded-xl border outline-none bg-white/70 resize-none leading-relaxed"
          style={{ borderColor: 'rgba(0,0,0,0.08)', maxHeight: MAX_TEXTAREA_PX }}
        />
        {sending ? (
          <button
            type="button"
            onClick={stop}
            title="עצור"
            aria-label="Stop"
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            style={{ background: '#ef4444' }}
          >
            <Square size={15} color="white" fill="white" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            title="שלח (Enter)"
            aria-label="Send"
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-opacity disabled:opacity-40"
            style={{ background: accent }}
          >
            <Send size={16} color="white" />
          </button>
        )}
      </form>
    </section>
  )
}
