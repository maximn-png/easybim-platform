'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'

interface Msg {
  id: string
  role: string
  content: string
}

const SUGGESTIONS = [
  'מה עשית בריצה האחרונה?',
  'תקצר את הפוסטים לעתיד',
  'איך אתה בוחר נושאים?',
]

export default function Chat({ agentKey, accent, emoji }: { agentKey: string; accent: string; emoji: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    const optimistic: Msg = { id: `tmp-${messages.length}`, role: 'user', content: msg }
    setMessages((m) => [...m, optimistic])
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        setMessages((m) => [...m, data.reply])
      } else {
        setMessages((m) => [...m, { id: `err-${m.length}`, role: 'assistant', content: `⚠️ ${data.error ?? 'Something went wrong'}` }])
      }
    } catch {
      setMessages((m) => [...m, { id: `err-${m.length}`, role: 'assistant', content: '⚠️ Network error — try again.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="rounded-2xl bg-white/55 backdrop-blur-sm border border-white/90 shadow-sm overflow-hidden flex flex-col" style={{ height: 460 }}>
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        <span className="text-lg">{emoji}</span>
        <div>
          <p className="text-sm font-bold" style={{ color: '#111827' }}>Chat with Peacock</p>
          <p className="text-[11px]" style={{ color: '#9ca3af' }}>Ask questions · give feedback it remembers · advisor only (no board changes)</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {!loaded ? (
          <p className="text-xs text-center my-auto" style={{ color: '#9ca3af' }}>Loading…</p>
        ) : messages.length === 0 ? (
          <div className="my-auto text-center">
            <span className="text-2xl">{emoji}</span>
            <p className="text-sm font-semibold mt-2" style={{ color: '#6b7280' }}>Ask Peacock anything</p>
            <p className="text-xs mt-1 mb-3" style={{ color: '#9ca3af' }}>or give it a preference to remember</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
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
          messages.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.role === 'user' ? 'self-end' : 'self-start'}`}
              style={{ background: m.role === 'user' ? 'rgba(68,184,211,0.14)' : `${accent}0f` }}>
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#374151' }} dir="auto">{m.content}</p>
            </div>
          ))
        )}
        {sending && (
          <div className="self-start rounded-2xl px-3.5 py-2.5 inline-flex items-center gap-1.5" style={{ background: `${accent}0f` }}>
            <Sparkles size={13} className="animate-pulse" style={{ color: accent }} />
            <span className="text-xs" style={{ color: '#9ca3af' }}>Peacock is thinking…</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="p-3 border-t flex items-center gap-2"
        style={{ borderColor: 'rgba(0,0,0,0.05)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Peacock…"
          dir="auto"
          className="flex-1 text-sm px-3.5 py-2.5 rounded-xl border outline-none bg-white/70"
          style={{ borderColor: 'rgba(0,0,0,0.08)' }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40"
          style={{ background: accent }}
        >
          <Send size={16} color="white" />
        </button>
      </form>
    </section>
  )
}
