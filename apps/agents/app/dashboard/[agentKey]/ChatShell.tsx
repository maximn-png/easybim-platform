'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Info, Lightbulb, PanelLeft } from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import ChatArea, { CreatedConversation } from './ChatArea'
import ConversationSidebar, { ConversationItem } from './ConversationSidebar'
import InfoPanel, { PanelTab } from './InfoPanel'

export default function ChatShell({
  agentKey,
  agentName,
  description,
  presentation: p,
}: {
  agentKey: string
  agentName: string
  description: string
  presentation: AgentPresentation
}) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null) // null = new chat
  const [panel, setPanel] = useState<PanelTab | null>(null)
  // Sidebar: static column on desktop (open by default), overlay on mobile
  // (closed by default). Starts closed and opens on mount for desktop widths
  // to avoid an SSR hydration mismatch.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarOpen(true)
  }, [])

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/conversations`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setConversations(
          (data.conversations ?? []).map((c: ConversationItem & { lastMessageAt?: string }) => ({
            ...c,
            lastMessageAt: c.lastMessageAt ?? null,
          }))
        )
      }
    } catch {
      /* transient */
    }
  }, [agentKey])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const active = conversations.find((c) => c.id === activeId) ?? null

  function onConversationCreated(c: CreatedConversation) {
    setConversations((xs) => [{ id: c.id, title: c.title, shared: c.shared, lastMessageAt: c.lastMessageAt }, ...xs])
    setActiveId(c.id)
  }

  function onConversationTouched(id: string) {
    const now = new Date().toISOString()
    setConversations((xs) => {
      const touched = xs.find((c) => c.id === id)
      if (!touched) return xs
      const rest = xs.filter((c) => c.id !== id)
      const shared = rest.filter((c) => c.shared)
      const own = rest.filter((c) => !c.shared)
      return touched.shared
        ? [...shared, { ...touched, lastMessageAt: now }, ...own]
        : [...shared, { ...touched, lastMessageAt: now }, ...own.filter((c) => c.id !== id)]
    })
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
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}
    >
      {/* decorative glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-6%', right: '-8%', width: 620, height: 620, background: `radial-gradient(circle, ${p.accent}22 0%, transparent 65%)` }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '-8%', width: 560, height: 560, background: 'radial-gradient(circle, rgba(30,36,140,0.08) 0%, transparent 65%)' }} />
      </div>

      {/* header */}
      <header
        className="relative z-20 shrink-0 flex items-center gap-3 px-4 py-2.5 border-b bg-white/50 backdrop-blur-md"
        style={{ borderColor: 'rgba(0,0,0,0.05)' }}
      >
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title="Chats"
          aria-label="Toggle chat list"
          className="rounded-lg p-1.5 hover:bg-black/5 transition-colors"
        >
          <PanelLeft size={17} style={{ color: '#6b7280' }} />
        </button>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
          style={{ color: 'rgba(30,36,140,0.7)' }}
        >
          <ArrowLeft size={13} /> Agent Kingdom
        </Link>

        <div className="flex items-center gap-2 mx-auto min-w-0">
          <span className="text-xl">{p.emoji}</span>
          <span className="font-black text-base truncate" style={{ color: '#1e248c' }}>{agentName}</span>
          <span className="hidden sm:inline text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: `${p.accent}14`, color: p.accent }}>
            {p.tagline}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <HeaderButton
            active={panel === 'improvements'}
            accent={p.accent}
            onClick={() => setPanel((v) => (v === 'improvements' ? null : 'improvements'))}
            icon={<Lightbulb size={15} />}
            label="Improvements"
          />
          <HeaderButton
            active={panel === 'about'}
            accent={p.accent}
            onClick={() => setPanel((v) => (v === 'about' ? null : 'about'))}
            icon={<Info size={15} />}
            label="About"
          />
        </div>
      </header>

      {/* body: sidebar | chat | info panel */}
      <div className="relative z-10 flex-1 flex min-h-0">
        {/* conversations sidebar — static column on desktop, overlay on mobile */}
        <aside
          className={`${sidebarOpen ? 'w-64' : 'w-0'} hidden md:block shrink-0 transition-all duration-200 overflow-hidden border-r bg-white/40 backdrop-blur-sm`}
          style={{ borderColor: 'rgba(0,0,0,0.05)' }}
        >
          <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            accent={p.accent}
            onSelect={setActiveId}
            onNew={() => setActiveId(null)}
            onDelete={deleteConversation}
          />
        </aside>
        {sidebarOpen && (
          <div className="md:hidden absolute inset-0 z-30 flex">
            <div className="w-72 max-w-[85%] bg-white shadow-xl">
              <ConversationSidebar
                conversations={conversations}
                activeId={activeId}
                accent={p.accent}
                onSelect={(id) => { setActiveId(id); setSidebarOpen(false) }}
                onNew={() => { setActiveId(null); setSidebarOpen(false) }}
                onDelete={deleteConversation}
              />
            </div>
            <div className="flex-1 bg-black/20" onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* chat — the hero */}
        <ChatArea
          agentKey={agentKey}
          accent={p.accent}
          emoji={p.emoji}
          copy={p.chat!}
          conversationId={activeId}
          shared={!!active?.shared}
          onConversationCreated={onConversationCreated}
          onConversationTouched={onConversationTouched}
        />

        {/* about / improvements panel */}
        {panel && (
          <>
            <aside className="hidden lg:block w-[380px] shrink-0">
              <InfoPanel
                agentKey={agentKey}
                agentName={agentName}
                description={description}
                presentation={p}
                tab={panel}
                onTabChange={setPanel}
                onClose={() => setPanel(null)}
              />
            </aside>
            <div className="lg:hidden absolute inset-0 z-30 flex justify-end">
              <div className="flex-1 bg-black/20" onClick={() => setPanel(null)} />
              <div className="w-[380px] max-w-[92%] h-full">
                <InfoPanel
                  agentKey={agentKey}
                  agentName={agentName}
                  description={description}
                  presentation={p}
                  tab={panel}
                  onTabChange={setPanel}
                  onClose={() => setPanel(null)}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function HeaderButton({
  active,
  accent,
  onClick,
  icon,
  label,
}: {
  active: boolean
  accent: string
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors hover:bg-black/5"
      style={{ background: active ? `${accent}14` : undefined, color: active ? accent : '#6b7280' }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
