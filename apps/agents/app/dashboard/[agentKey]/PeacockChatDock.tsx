'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Info, Maximize2, Plus, Trash2, Users, X } from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import ChatArea, { CreatedConversation } from './ChatArea'
import type { ConversationItem } from './ConversationSidebar'
import { ACCENT, ACCENT_BG } from './postMeta'

// Ask Peacock, docked beside the dashboard instead of replacing it.
//
// Planning is what you are doing when you talk to Peacock, so the plan should
// stay on screen while you do it: "spread these over next month" is far easier
// to check when Posts & Timeline is right there. The full-page chat workspace
// is still one click away for a long session.
//
// Conversation state lives here rather than in ChatArea because the history
// list, the New-chat button and the chat body all need it — the same split
// ChatShell uses.
export default function PeacockChatDock({
  agentKey, presentation: p, onClose, onExpand, agentName = 'Peacock',
}: {
  agentKey: string
  presentation: AgentPresentation
  /** Whose dock this is — Squirrel reuses it, so the header and note name the agent. */
  agentName?: string
  onClose: () => void
  /** Hand over to the full-page chat workspace. */
  onExpand: () => void
}) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null) // null = new chat
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/conversations`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setConversations(
        (data.conversations ?? []).map((c: ConversationItem & { lastMessageAt?: string }) => ({
          ...c,
          lastMessageAt: c.lastMessageAt ?? null,
        }))
      )
    } catch { /* transient */ }
  }, [agentKey])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Close the history popover on an outside click — it overlays the chat body,
  // so leaving it open swallows the next thing you try to do.
  useEffect(() => {
    if (!historyOpen) return
    function onDown(e: MouseEvent) {
      if (!historyRef.current?.contains(e.target as Node)) setHistoryOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [historyOpen])

  const active = conversations.find((c) => c.id === activeId) ?? null

  function onConversationCreated(c: CreatedConversation) {
    setConversations((xs) => [{ id: c.id, title: c.title, shared: c.shared, lastMessageAt: c.lastMessageAt }, ...xs])
    setActiveId(c.id)
  }

  function onConversationTouched(id: string) {
    const now = new Date().toISOString()
    setConversations((xs) => xs.map((c) => (c.id === id ? { ...c, lastMessageAt: now } : c)))
  }

  async function deleteConversation(id: string) {
    setConversations((xs) => xs.filter((c) => c.id !== id))
    if (activeId === id) setActiveId(null)
    try {
      await fetch(`/api/dashboard/${agentKey}/conversations/${id}`, { method: 'DELETE' })
    } catch {
      loadConversations() // restore on failure
    }
  }

  return (
    <aside
      className="flex flex-col"
      style={{
        background: 'linear-gradient(160deg,#f7f9ff 0%,#eef4fd 100%)',
        border: '1px solid #e3e8f4',
        borderRadius: 16,
        boxShadow: '0 1px 3px rgba(30,36,140,.06)',
        overflow: 'hidden',
        // Tall enough to be a real chat, short enough that the dashboard beside
        // it still scrolls as one page.
        height: 'calc(100vh - 120px)',
        position: 'sticky',
        top: 16,
      }}
    >
      <header
        className="shrink-0 flex items-center gap-1.5"
        style={{ padding: '10px 10px 10px 14px', borderBottom: '1px solid #e7ebf5', background: 'rgba(255,255,255,.6)' }}
      >
        <span style={{ fontSize: 16 }}>{p.emoji}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT }}>Ask {agentName}</span>

        <div className="flex items-center gap-0.5" style={{ marginInlineStart: 'auto' }}>
          <DockButton title="New chat" onClick={() => { setActiveId(null); setHistoryOpen(false) }}>
            <Plus size={15} />
          </DockButton>

          <div ref={historyRef} style={{ position: 'relative' }}>
            <DockButton title="Past chats" active={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
              <History size={15} />
            </DockButton>
            {historyOpen && (
              <div
                style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 260, maxHeight: 320,
                  overflowY: 'auto', background: '#fff', border: '1px solid #e3e8f4', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(30,36,140,.14)', zIndex: 40, padding: 6 }}
              >
                {conversations.length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '14px 8px', margin: 0 }}>
                    No past chats yet.
                  </p>
                )}
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className="group flex items-center gap-2"
                    onClick={() => { setActiveId(c.id); setHistoryOpen(false) }}
                    style={{ padding: '7px 8px', borderRadius: 8, cursor: 'pointer',
                      background: activeId === c.id ? ACCENT_BG : 'transparent' }}
                  >
                    {c.shared && <Users size={12} style={{ color: '#9ca3af', flex: 'none' }} />}
                    <span dir="auto" title={c.title}
                      style={{ fontSize: 12.5, color: activeId === c.id ? '#111827' : '#4b5563',
                        fontWeight: activeId === c.id ? 600 : 400, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {c.title}
                    </span>
                    {!c.shared && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirmId === c.id) { setConfirmId(null); deleteConversation(c.id) } else setConfirmId(c.id)
                        }}
                        title={confirmId === c.id ? 'Click again to delete' : 'Delete chat'}
                        className={confirmId === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, flex: 'none' }}
                      >
                        <Trash2 size={12} style={{ color: confirmId === c.id ? '#dc2626' : '#9ca3af' }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DockButton title="Open the full chat workspace" onClick={onExpand}>
            <Maximize2 size={14} />
          </DockButton>
          <DockButton title="Close chat" onClick={onClose}>
            <X size={15} />
          </DockButton>
        </div>
      </header>

      <ChatArea
        agentKey={agentKey}
        accent={p.accent}
        emoji={p.emoji}
        copy={p.chat!}
        conversationId={activeId}
        shared={!!active?.shared}
        compact
        onConversationCreated={onConversationCreated}
        onConversationTouched={onConversationTouched}
      />

      {/* The one thing the chat UI never said out loud: a standing instruction
          given here is not scoped to this thread. */}
      <div
        className="shrink-0 flex items-start gap-1.5"
        style={{ padding: '8px 12px', borderTop: '1px solid #e7ebf5', background: 'rgba(255,255,255,.5)',
          fontSize: 11, color: '#8b909c', lineHeight: 1.45 }}
      >
        <Info size={12} style={{ flex: 'none', marginTop: 1.5 }} />
        <span>
          A standing instruction you give here is saved as <strong style={{ color: '#6b7280' }}>guidance</strong> and
          applies to every {agentName} chat and its scheduled runs — not only this thread.
        </span>
      </div>
    </aside>
  )
}

function DockButton({
  title, active = false, onClick, children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex items-center justify-center transition-colors hover:bg-black/5"
      style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? ACCENT_BG : 'transparent', color: active ? ACCENT : '#6b7280' }}
    >
      {children}
    </button>
  )
}
