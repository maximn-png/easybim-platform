'use client'

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  AlertCircle, BookOpen, ChevronRight, Clock3, FolderKanban, LayoutDashboard, UserRound,
} from 'lucide-react'

/* Header "My Space" pill + personal panel, shown on the portal dashboard.
   The page itself lives in EPM (/me) — this panel deep-links there, and pulls
   its quick stats from EPM's API cross-origin (same-site, cookies included;
   EPM's /api/me/* routes send CORS headers for the portal origin). When the
   stats can't load (e.g. no EPM session yet in this browser), the panel
   degrades to identity from Clerk plus the links. */

const EPM_URL = process.env.NEXT_PUBLIC_EPM_URL || 'http://localhost:3002'

interface MeOverviewLite {
  name: string
  email: string | null
  avatarUrl: string | null
  kpis: { myProjectCount: number; myActiveIssues: number; expectedWeeklyHours: number }
}

interface TimeEntryLite { hours: number }

function toYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function HeaderMePanel() {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [overview, setOverview] = useState<MeOverviewLite | null>(null)
  const [weekHours, setWeekHours] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on click-outside / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    fetch(`${EPM_URL}/api/me/overview`, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ overview?: MeOverviewLite }>)
      .then((data) => setOverview(data.overview ?? null))
      .catch(() => {})
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    const end = new Date(start); end.setDate(end.getDate() + 6)
    fetch(`${EPM_URL}/api/me/time-entries?start=${toYMD(start)}&end=${toYMD(end)}`, { credentials: 'include' })
      .then((r) => r.json() as Promise<{ entries?: TimeEntryLite[] }>)
      .then((data) => setWeekHours((data.entries ?? []).reduce((s, e) => s + e.hours, 0)))
      .catch(() => {})
  }, [])

  const avatarUrl = overview?.avatarUrl || user?.imageUrl || null
  const name = overview?.name || user?.fullName || 'My Space'
  const email = overview?.email || user?.primaryEmailAddress?.emailAddress || null

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors hover:bg-white"
        style={{
          background: open ? 'rgba(68,184,211,0.12)' : 'rgba(30,36,140,0.06)',
          borderColor: open ? 'rgba(68,184,211,0.45)' : 'rgba(30,36,140,0.20)',
          color: '#1e248c',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="w-5 h-5 rounded-full object-cover -ml-1" />
        ) : (
          <UserRound size={12} style={{ color: '#44b8d3' }} />
        )}
        My Space
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-[#e8eaff] shadow-xl p-3 z-50">
          <div className="flex items-center gap-2.5 pb-2.5 mb-2.5 border-b border-[#eef0fb]">
            {avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#1e248c]">{name}</div>
              {email && <div className="text-[10px] text-gray-400">{email}</div>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mb-2.5">
            <PanelStat
              value={weekHours != null ? `${weekHours}/${overview?.kpis.expectedWeeklyHours ?? 40}` : '—'}
              label="hrs this week"
            />
            <PanelStat
              value={overview ? String(overview.kpis.myActiveIssues) : '—'}
              label="issues to deal"
              alert={(overview?.kpis.myActiveIssues ?? 0) > 0}
            />
            <PanelStat
              value={overview ? String(overview.kpis.myProjectCount) : '—'}
              label="my projects"
            />
          </div>

          <nav className="flex flex-col">
            <PanelLink href={`${EPM_URL}/me`} icon={<LayoutDashboard size={13} />} label="My Space" />
            <PanelLink href={`${EPM_URL}/me#time`} icon={<Clock3 size={13} />} label="Time tracking" />
            <PanelLink href={`${EPM_URL}/me#time`} icon={<AlertCircle size={13} />} label="Issues to deal" />
            <PanelLink href={`${EPM_URL}/me#calendar`} icon={<FolderKanban size={13} />} label="My calendar" />
            <PanelLink href={`${EPM_URL}/me#knowledge`} icon={<BookOpen size={13} />} label="Knowledge Center" />
          </nav>
        </div>
      )}
    </div>
  )
}

function PanelStat({ value, label, alert }: { value: string; label: string; alert?: boolean }) {
  return (
    <div className="bg-[#f0f3ff] rounded-lg px-1.5 py-2 text-center">
      <div className={`text-[13px] font-bold tabular-nums ${alert ? 'text-red-500' : 'text-[#1e248c]'}`}>{value}</div>
      <div className="text-[9px] text-gray-500 leading-tight">{label}</div>
    </div>
  )
}

function PanelLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-blue-50 hover:text-[#1e248c] transition-colors"
    >
      <span className="text-gray-400">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight size={12} className="text-gray-300" />
    </a>
  )
}
