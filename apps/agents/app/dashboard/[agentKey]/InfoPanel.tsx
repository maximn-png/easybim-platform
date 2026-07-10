'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Lightbulb, Info, Trash2, Loader2 } from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import HowItWorks from './HowItWorks'
import RunHistory from './RunHistory'

export type PanelTab = 'about' | 'improvements'

interface GuidanceItem {
  id: string
  text: string
  active: boolean
  createdBy: string | null
  createdAt: string | null
}

function fmtDate(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function InfoPanel({
  agentKey,
  agentName,
  description,
  presentation: p,
  tab,
  onTabChange,
  onClose,
}: {
  agentKey: string
  agentName: string
  description: string
  presentation: AgentPresentation
  tab: PanelTab
  onTabChange: (t: PanelTab) => void
  onClose: () => void
}) {
  return (
    <div className="h-full flex flex-col bg-white/70 backdrop-blur-md border-l" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
      <div className="flex items-center gap-1 p-2 border-b shrink-0" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        <TabButton
          active={tab === 'about'}
          accent={p.accent}
          icon={<Info size={13} />}
          label="About"
          onClick={() => onTabChange('about')}
        />
        <TabButton
          active={tab === 'improvements'}
          accent={p.accent}
          icon={<Lightbulb size={13} />}
          label="Improvements"
          onClick={() => onTabChange('improvements')}
        />
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="ml-auto rounded-lg p-1.5 hover:bg-black/5 transition-colors"
        >
          <X size={16} style={{ color: '#6b7280' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'about' ? (
          <AboutTab agentKey={agentKey} agentName={agentName} description={description} p={p} />
        ) : (
          <ImprovementsTab agentKey={agentKey} accent={p.accent} emoji={p.emoji} />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  accent,
  icon,
  label,
  onClick,
}: {
  active: boolean
  accent: string
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors"
      style={{
        background: active ? `${accent}14` : 'transparent',
        color: active ? accent : '#6b7280',
      }}
    >
      {icon} {label}
    </button>
  )
}

// ————— About: description, why, how-it-works, run history —————

function AboutTab({
  agentKey,
  agentName,
  description,
  p,
}: {
  agentKey: string
  agentName: string
  description: string
  p: AgentPresentation
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${p.accent}18` }}>
          {p.emoji}
        </div>
        <div>
          <p className="font-black text-lg leading-tight" style={{ color: '#1e248c' }}>{agentName}</p>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{description}</p>
        </div>
      </div>

      {p.why && (
        <div
          className="rounded-xl px-3.5 py-3 text-xs leading-relaxed"
          style={{ background: `${p.accent}0d`, borderLeft: `3px solid ${p.accent}`, color: '#4b5563' }}
        >
          <span className="font-semibold" style={{ color: p.accent }}>Why {agentName}? </span>
          {p.why}
        </div>
      )}

      <HowItWorks accent={p.accent} data={p.howItWorks} />

      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: '#9ca3af' }}>Run history</h2>
        <RunHistory agentKey={agentKey} accent={p.accent} />
      </div>
    </div>
  )
}

// ————— Improvements: shared guidance the agent learned via chat —————

function ImprovementsTab({ agentKey, accent, emoji }: { agentKey: string; accent: string; emoji: string }) {
  const [items, setItems] = useState<GuidanceItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/guidance`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setItems(data.guidance ?? [])
      }
    } catch {
      /* transient */
    } finally {
      setLoaded(true)
    }
  }, [agentKey])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(item: GuidanceItem) {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/guidance/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      })
      if (res.ok) setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, active: !item.active } : x)))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: GuidanceItem) {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/guidance/${item.id}`, { method: 'DELETE' })
      if (res.ok) setItems((xs) => xs.filter((x) => x.id !== item.id))
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  if (!loaded) {
    return <p className="text-xs text-center py-10" style={{ color: '#9ca3af' }}>Loading…</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>
        Everything the agent has learned through chat — shared across all users. Active items are injected into the
        agent&apos;s instructions on every run; switch one off (or delete it) to stop applying it.
      </p>

      {items.length === 0 ? (
        <div className="text-center py-10 rounded-xl border-2 border-dashed" style={{ borderColor: 'rgba(30,36,140,0.12)' }}>
          <span className="text-2xl">{emoji}</span>
          <p className="text-sm font-semibold mt-2" style={{ color: '#6b7280' }}>No improvements yet</p>
          <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
            Give the agent a lasting instruction in chat and it will appear here.
          </p>
        </div>
      ) : (
        items.map((item) => {
          const busy = busyId === item.id
          const confirming = confirmId === item.id
          return (
            <div
              key={item.id}
              className="rounded-xl border p-3 flex flex-col gap-2 transition-opacity"
              style={{
                borderColor: 'rgba(0,0,0,0.07)',
                background: item.active ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.025)',
                opacity: item.active ? 1 : 0.65,
              }}
            >
              <p className="text-[13px] leading-relaxed" style={{ color: '#374151' }} dir="auto">
                {item.text}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: '#b0b6c0' }}>{fmtDate(item.createdAt)}</span>
                {!item.active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(0,0,0,0.06)', color: '#6b7280' }}>
                    Disabled
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {busy && <Loader2 size={12} className="animate-spin" style={{ color: '#9ca3af' }} />}
                  {/* on/off switch */}
                  <button
                    onClick={() => toggle(item)}
                    disabled={busy}
                    title={item.active ? 'השבת' : 'הפעל'}
                    aria-label={item.active ? 'Disable improvement' : 'Enable improvement'}
                    className="relative w-8 h-[18px] rounded-full transition-colors"
                    style={{ background: item.active ? accent : 'rgba(0,0,0,0.15)' }}
                  >
                    <span
                      className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all"
                      style={{ left: item.active ? 16 : 2 }}
                    />
                  </button>
                  <button
                    onClick={() => (confirming ? remove(item) : setConfirmId(item.id))}
                    onMouseLeave={() => confirming && setConfirmId(null)}
                    disabled={busy}
                    title={confirming ? 'לחצו שוב לאישור מחיקה' : 'מחק'}
                    aria-label="Delete improvement"
                    className={`rounded-md p-1 transition-colors ${confirming ? 'bg-red-50' : 'hover:bg-black/5'}`}
                  >
                    <Trash2 size={13} style={{ color: confirming ? '#dc2626' : '#9ca3af' }} />
                  </button>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
