'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Square, Copy, Check, Users } from 'lucide-react'
import type { ChatCopy } from '@/lib/agents/presentation'
import MarkdownView from './Markdown'

interface Msg {
  id: string
  role: string
  content: string
}

export interface CreatedConversation {
  id: string
  title: string
  shared: boolean
  lastMessageAt: string
}

const MAX_TEXTAREA_PX = 160

export default function ChatArea({
  agentKey,
  accent,
  emoji,
  copy,
  conversationId,
  shared,
  onConversationCreated,
  onConversationTouched,
}: {
  agentKey: string
  accent: string
  emoji: string
  copy: ChatCopy
  conversationId: string | null
  shared: boolean
  onConversationCreated: (c: CreatedConversation) => void
  onConversationTouched: (id: string) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Conversation ids created by THIS component (skip the fetch when the
  // parent echoes them back as the active conversation).
  const selfCreated = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setLoaded(true)
      return
    }
    if (selfCreated.current.has(conversationId)) return // already rendered optimistically
    setLoaded(false)
    setMessages([])
    fetch(`/api/dashboard/${agentKey}/chat?conversationId=${conversationId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [agentKey, conversationId])

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
    if (!msg || sending || shared) return
    setInput('')
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    const optimistic: Msg = { id: `tmp-${Date.now()}`, role: 'user', content: msg }
    setMessages((m) => [...m, optimistic])
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, conversationId }),
        signal: controller.signal,
      })
      const data = await res.json()
      // First message of a fresh chat → the server created the conversation.
      const createdId: string | undefined = data.conversation?.id ?? data.conversationId
      if (!conversationId && createdId) {
        selfCreated.current.add(createdId)
        onConversationCreated({
          id: createdId,
          title: data.conversation?.title ?? (msg.length > 60 ? `${msg.slice(0, 60)}…` : msg),
          shared: false,
          lastMessageAt: new Date().toISOString(),
        })
      } else if (conversationId) {
        onConversationTouched(conversationId)
      }
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
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-3 min-h-full">
          {!loaded ? (
            <p className="text-xs text-center my-auto" style={{ color: '#9ca3af' }}>Loading…</p>
          ) : messages.length === 0 ? (
            <div className="my-auto text-center">
              <span className="text-4xl">{emoji}</span>
              <p className="text-lg font-bold mt-3" style={{ color: '#374151' }}>{copy.emptyTitle}</p>
              <p className="text-sm mt-1 mb-4" style={{ color: '#9ca3af' }}>{copy.emptyHint}</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                {copy.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3.5 py-2 rounded-full border transition-colors hover:bg-white/70 bg-white/40"
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
                    className="rounded-2xl px-4 py-3 break-words shadow-sm"
                    style={{ background: isUser ? 'rgba(68,184,211,0.16)' : 'rgba(255,255,255,0.75)' }}
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
            <div className="self-start rounded-2xl px-4 py-3 inline-flex items-center gap-1.5 shadow-sm" style={{ background: 'rgba(255,255,255,0.75)' }}>
              <Sparkles size={13} className="animate-pulse" style={{ color: accent }} />
              <span className="text-xs" style={{ color: '#9ca3af' }}>{copy.thinking}</span>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t bg-white/50 backdrop-blur-sm" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          {shared ? (
            <p className="text-xs text-center py-2 inline-flex items-center gap-1.5 w-full justify-center" style={{ color: '#9ca3af' }}>
              <Users size={13} /> שיחת צוות (ארכיון) — לקריאה בלבד · פתחו שיחה חדשה כדי לכתוב
            </p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex items-end gap-2">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={copy.placeholder}
                dir="auto"
                rows={1}
                className="flex-1 text-sm px-4 py-3 rounded-2xl border outline-none bg-white resize-none leading-relaxed shadow-sm"
                style={{ borderColor: 'rgba(0,0,0,0.08)', maxHeight: MAX_TEXTAREA_PX }}
              />
              {sending ? (
                <button
                  type="button"
                  onClick={stop}
                  title="עצור"
                  aria-label="Stop"
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors"
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
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-opacity disabled:opacity-40"
                  style={{ background: accent }}
                >
                  <Send size={16} color="white" />
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
