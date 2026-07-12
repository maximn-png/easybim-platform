'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, ShieldCheck, Mail, Trash2, UserPlus, Loader2, Clock, X,
  ChevronDown, LogIn, ExternalLink, LayoutGrid, Users, CheckCircle2,
} from 'lucide-react'
import { CARDS } from '@/lib/cards'

export interface AdminUser {
  id: string
  name: string
  email: string
  imageUrl: string
  lastSignInAt: number | null
  lastEvent: { type: string; app: string; at: number } | null
  admin: boolean
  apps: string[]
  isSelf: boolean
}

export interface PendingInvitation {
  id: string
  email: string
  admin: boolean
  apps: string[]
  createdAt: number
}

export interface StaffGroup {
  domain: string
  count: number
  /** Per card id: do all / some / none of the (non-admin) staff hold it. */
  state: Record<string, 'all' | 'some' | 'none'>
}

interface TimelineEvent {
  type: 'sign_in' | 'card_open' | 'app_visit'
  at: number
  app?: string
  count?: number
  browser?: string
}

const NAVY = '#1e248c'
const CYAN = '#44b8d3'

const cardTitle = (id: string) => CARDS.find((c) => c.id === id)?.title ?? id

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(ts: number): string {
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  const date = new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (day === today) return `Today · ${date}`
  if (day === today - DAY_MS) return `Yesterday · ${date}`
  const weekday = new Date(ts).toLocaleDateString('en-GB', { weekday: 'long' })
  return `${weekday} · ${date}`
}

function whenLabel(ts: number): string {
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  if (day === today) return `Today, ${timeOf(ts)}`
  if (day === today - DAY_MS) return `Yesterday, ${timeOf(ts)}`
  const date = new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${date}, ${timeOf(ts)}`
}

function eventDescription(ev: { type: string; app: string }): string {
  if (ev.type === 'card_open') return `opened ${cardTitle(ev.app)} card`
  if (ev.type === 'app_visit') return `worked in ${cardTitle(ev.app)}`
  return ''
}

/** Fold hourly visit buckets into one line per (day, app); keep other events as-is. */
function groupTimeline(events: TimelineEvent[]): TimelineEvent[] {
  const visits = new Map<string, TimelineEvent>()
  const rest: TimelineEvent[] = []
  for (const ev of events) {
    if (ev.type !== 'app_visit' || !ev.app) {
      rest.push(ev)
      continue
    }
    const key = `${startOfDay(ev.at)}:${ev.app}`
    const existing = visits.get(key)
    if (existing) {
      existing.count = (existing.count ?? 1) + (ev.count ?? 1)
      existing.at = Math.max(existing.at, ev.at)
    } else {
      visits.set(key, { ...ev, count: ev.count ?? 1 })
    }
  }
  return [...rest, ...visits.values()].sort((a, b) => b.at - a.at)
}

function EventIcon({ type }: { type: TimelineEvent['type'] }) {
  const styles: Record<TimelineEvent['type'], { bg: string; color: string }> = {
    sign_in: { bg: 'rgba(30,36,140,0.08)', color: NAVY },
    card_open: { bg: 'rgba(68,184,211,0.14)', color: NAVY },
    app_visit: { bg: 'rgba(124,58,237,0.10)', color: '#7c3aed' },
  }
  const s = styles[type]
  const Icon = type === 'sign_in' ? LogIn : type === 'card_open' ? ExternalLink : LayoutGrid
  return (
    <span
      className="w-6 h-6 rounded-lg flex items-center justify-center flex-none"
      style={{ background: s.bg, color: s.color }}
    >
      <Icon size={13} />
    </span>
  )
}

function ActivityTimeline({
  events, days, loading, onShowMore,
}: { events: TimelineEvent[]; days: number; loading: boolean; onShowMore: () => void }) {
  if (loading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs" style={{ color: '#9ca3af' }}>
        <Loader2 size={13} className="animate-spin" /> Loading activity…
      </div>
    )
  }
  if (events.length === 0) {
    return (
      <div className="py-3 text-xs" style={{ color: '#9ca3af' }}>
        No activity recorded in the last {days} days.
      </div>
    )
  }

  const grouped = groupTimeline(events)
  let currentDay = -1

  return (
    <div
      className="ml-11 mb-3.5 pl-4"
      style={{ borderLeft: '2px solid rgba(68,184,211,0.35)' }}
    >
      {grouped.map((ev, i) => {
        const day = startOfDay(ev.at)
        const showLabel = day !== currentDay
        currentDay = day
        return (
          <div key={i}>
            {showLabel && (
              <div
                className="text-xs font-bold uppercase tracking-wide mt-2.5 mb-1.5"
                style={{ color: '#9ca3af', fontSize: 11 }}
              >
                {dayLabel(ev.at)}
              </div>
            )}
            <div className="flex items-center gap-2.5 py-1">
              <EventIcon type={ev.type} />
              <span className="flex-1 text-sm" style={{ color: '#374151' }}>
                {ev.type === 'sign_in' && (
                  <>Signed in{ev.browser && <span style={{ color: '#9ca3af' }}> · {ev.browser}</span>}</>
                )}
                {ev.type === 'card_open' && (
                  <>Opened the <b className="font-semibold">{cardTitle(ev.app!)}</b> card</>
                )}
                {ev.type === 'app_visit' && (
                  <>
                    Worked in <b className="font-semibold">{cardTitle(ev.app!)}</b>
                    {(ev.count ?? 1) > 1 && (
                      <span style={{ color: '#9ca3af' }}> · {ev.count} visits</span>
                    )}
                  </>
                )}
              </span>
              <span className="text-xs tabular-nums" style={{ color: '#9ca3af' }}>
                {timeOf(ev.at)}
              </span>
            </div>
          </div>
        )
      })}
      <div className="text-xs mt-2 mb-1" style={{ color: '#9ca3af' }}>
        Showing last {days} days
        {days < 30 && (
          <>
            {' · '}
            <button
              type="button"
              onClick={onShowMore}
              disabled={loading}
              className="font-semibold hover:underline disabled:opacity-50"
              style={{ color: NAVY }}
            >
              {loading ? 'Loading…' : 'Show more'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function CardChip({
  label, active, mixed, disabled, onClick, title,
}: {
  label: string
  active: boolean
  /** Partial state: some (not all) of the group holds this card. */
  mixed?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
}) {
  const style = active
    ? { background: 'rgba(68,184,211,0.15)', border: `1px solid ${CYAN}`, color: NAVY }
    : mixed
      ? { background: 'rgba(68,184,211,0.06)', border: `1px dashed ${CYAN}`, color: NAVY }
      : { background: 'rgba(255,255,255,0.6)', border: '1px solid #e5e7eb', color: '#9ca3af' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-xs px-2.5 py-1 rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      style={style}
    >
      {label}
      {mixed && ' ·'}
    </button>
  )
}

interface DrawerState {
  open: boolean
  loading: boolean
  days: number
  events: TimelineEvent[]
  loaded: boolean
}

export default function UserManagement({
  users, invitations, staff,
}: { users: AdminUser[]; invitations: PendingInvitation[]; staff: StaffGroup }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [drawers, setDrawers] = useState<Record<string, DrawerState>>({})

  // Invite form state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteApps, setInviteApps] = useState<string[]>([])
  const [inviteAdmin, setInviteAdmin] = useState(false)

  const parsedEmails = [
    ...new Set(inviteEmails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ]

  async function call(key: string, url: string, init: RequestInit): Promise<boolean> {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Request failed')
        return false
      }
      startTransition(() => router.refresh())
      return true
    } catch {
      setError('Network error — please try again')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function loadActivity(userId: string, days: number) {
    setDrawers((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? { open: true, events: [], loaded: false }), open: true, loading: true, days },
    }))
    try {
      const res = await fetch(`/api/admin/users/${userId}/activity?days=${days}`)
      const data = res.ok ? await res.json() : { events: [] }
      setDrawers((prev) => ({
        ...prev,
        [userId]: { open: true, loading: false, days, events: data.events ?? [], loaded: true },
      }))
    } catch {
      setDrawers((prev) => ({
        ...prev,
        [userId]: { open: true, loading: false, days, events: [], loaded: true },
      }))
    }
  }

  function toggleDrawer(userId: string) {
    const current = drawers[userId]
    if (current?.open) {
      setDrawers((prev) => ({ ...prev, [userId]: { ...current, open: false } }))
      return
    }
    if (current?.loaded) {
      setDrawers((prev) => ({ ...prev, [userId]: { ...current, open: true } }))
      return
    }
    void loadActivity(userId, 7)
  }

  function toggleApp(user: AdminUser, appId: string) {
    const apps = user.apps.includes(appId)
      ? user.apps.filter((a) => a !== appId)
      : [...user.apps, appId]
    void call(`${user.id}:${appId}`, `/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ apps }),
    })
  }

  function toggleAdmin(user: AdminUser) {
    void call(`${user.id}:admin`, `/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ admin: !user.admin }),
    })
  }

  function deleteUser(user: AdminUser) {
    if (!window.confirm(`Remove ${user.name} (${user.email}) from the platform? This cannot be undone.`)) return
    void call(`${user.id}:delete`, `/api/admin/users/${user.id}`, { method: 'DELETE' })
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (parsedEmails.length === 0) return
    setBusy('invite')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: parsedEmails, apps: inviteApps, admin: inviteAdmin }),
      })
      const data = await res.json().catch(() => null)
      const sent: string[] = data?.sent ?? []
      const failed: Array<{ email: string; reason: string }> = data?.failed ?? []
      if (sent.length > 0) {
        setNotice(`Sent ${sent.length} invitation${sent.length > 1 ? 's' : ''}: ${sent.join(', ')}`)
        // Keep only the addresses that failed, so they can be fixed and resent.
        setInviteEmails(failed.map((f) => f.email).join('\n'))
        if (failed.length === 0) {
          setInviteApps([])
          setInviteAdmin(false)
          setInviteOpen(false)
        }
        startTransition(() => router.refresh())
      }
      if (failed.length > 0) {
        setError(
          `${failed.length} invitation${failed.length > 1 ? 's' : ''} failed — ` +
            failed.map((f) => `${f.email} (${f.reason})`).join('; ')
        )
      } else if (sent.length === 0) {
        setError(data?.error ?? 'Failed to send invitations')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(null)
    }
  }

  async function toggleStaffApp(appId: string) {
    const grant = staff.state[appId] !== 'all'
    setBusy(`staff:${appId}`)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/users/bulk-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: appId, grant }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Failed to update staff permissions')
        return
      }
      setNotice(
        `${cardTitle(appId)} ${grant ? 'granted to' : 'removed from'} ${data.updated} EasyBIM employee${data.updated === 1 ? '' : 's'}`
      )
      startTransition(() => router.refresh())
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(null)
    }
  }

  function revokeInvitation(inv: PendingInvitation) {
    if (!window.confirm(`Revoke the invitation for ${inv.email}?`)) return
    void call(`${inv.id}:revoke`, `/api/admin/invitations/${inv.id}`, { method: 'DELETE' })
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-semibold mb-2"
            style={{ color: '#6b7280' }}
          >
            <ArrowLeft size={12} /> Back to dashboard
          </Link>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: NAVY }}>
            <ShieldCheck size={22} style={{ color: CYAN }} />
            User Management
          </h1>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            Grant or revoke access to platform cards, per user. Click the arrow on a row for the
            detailed activity timeline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
          style={{ background: NAVY }}
        >
          <UserPlus size={15} /> Invite users
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border text-sm flex items-center justify-between gap-3"
          style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {notice && (
        <div className="mb-4 px-4 py-3 rounded-xl border text-sm flex items-center justify-between gap-3"
          style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice(null)}><X size={14} /></button>
        </div>
      )}

      {/* Invite form */}
      {inviteOpen && (
        <form
          onSubmit={sendInvite}
          className="mb-6 bg-white/70 backdrop-blur-sm border border-white/90 rounded-2xl p-5 shadow-sm flex flex-col gap-4"
        >
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}>
            <Mail size={15} style={{ color: CYAN }} /> Invite new users
          </div>
          <div className="w-full max-w-md">
            <textarea
              required
              rows={3}
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              placeholder={'One or more email addresses — any domain works.\nSeparate with commas, spaces or new lines:\ndana@ana-corp.com, yossi@easybim.co.il'}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 resize-y"
              style={{ borderColor: '#e5e7eb' }}
            />
            {parsedEmails.length > 1 && (
              <div className="text-xs mt-1" style={{ color: '#6b7280' }}>
                {parsedEmails.length} addresses — everyone gets the same cards below
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: '#6b7280' }}>Cards:</span>
            {CARDS.map((card) => (
              <CardChip
                key={card.id}
                label={card.title}
                active={inviteApps.includes(card.id)}
                onClick={() =>
                  setInviteApps((prev) =>
                    prev.includes(card.id) ? prev.filter((a) => a !== card.id) : [...prev, card.id]
                  )
                }
              />
            ))}
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold ml-2 cursor-pointer" style={{ color: NAVY }}>
              <input
                type="checkbox"
                checked={inviteAdmin}
                onChange={(e) => setInviteAdmin(e.target.checked)}
              />
              Admin (can manage users)
            </label>
          </div>
          <div>
            <button
              type="submit"
              disabled={busy === 'invite' || parsedEmails.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: CYAN }}
            >
              {busy === 'invite' && <Loader2 size={14} className="animate-spin" />}
              {parsedEmails.length > 1
                ? `Send ${parsedEmails.length} invitations`
                : 'Send invitation'}
            </button>
          </div>
        </form>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="mb-6 bg-white/55 backdrop-blur-sm border border-white/90 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold mb-3" style={{ color: NAVY }}>
            <Clock size={14} style={{ color: CYAN }} /> Pending invitations
          </div>
          <div className="flex flex-col gap-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 text-sm flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold" style={{ color: '#111827' }}>{inv.email}</span>
                  {inv.admin && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'rgba(30,36,140,0.08)', color: NAVY }}>admin</span>
                  )}
                  {inv.apps.map((a) => (
                    <span key={a} className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(68,184,211,0.12)', color: NAVY }}>
                      {cardTitle(a)}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => revokeInvitation(inv)}
                  disabled={busy === `${inv.id}:revoke`}
                  className="text-xs font-semibold hover:underline disabled:opacity-50"
                  style={{ color: '#b91c1c' }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white/70 backdrop-blur-sm border border-white/90 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 820 }}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: '#9ca3af' }}>
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Card access</th>
              <th className="px-5 py-3 font-semibold">Last sign-in</th>
              <th className="px-5 py-3 font-semibold">Admin</th>
              <th className="px-5 py-3 font-semibold text-right">Activity</th>
            </tr>
          </thead>
          <tbody>
            {staff.count > 0 && (
              <tr className="border-t" style={{ borderColor: '#f0f2ff', background: 'rgba(30,36,140,0.025)' }}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-none"
                      style={{ background: 'rgba(30,36,140,0.10)', color: NAVY }}
                    >
                      <Users size={15} />
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: NAVY }}>EasyBIM domain</div>
                      <div className="text-xs" style={{ color: '#6b7280' }}>
                        @{staff.domain} · {staff.count} employee{staff.count === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CARDS.map((card) => {
                      const state = staff.state[card.id] ?? 'none'
                      return (
                        <CardChip
                          key={card.id}
                          label={card.title}
                          active={state === 'all'}
                          mixed={state === 'some'}
                          disabled={busy === `staff:${card.id}`}
                          title={
                            state === 'some'
                              ? 'Some employees have this card — click to grant it to everyone'
                              : state === 'all'
                                ? 'Click to remove from all employees'
                                : 'Click to grant to all employees'
                          }
                          onClick={() => void toggleStaffApp(card.id)}
                        />
                      )
                    })}
                  </div>
                </td>
                <td className="px-5 py-4 text-xs" style={{ color: '#9ca3af' }}>
                  Applies to all employees
                </td>
                <td className="px-5 py-4" />
                <td className="px-5 py-4" />
              </tr>
            )}
            {users.map((user) => {
              const drawer = drawers[user.id]
              return (
                <FragmentRow
                  key={user.id}
                  user={user}
                  drawer={drawer}
                  busy={busy}
                  onToggleApp={toggleApp}
                  onToggleAdmin={toggleAdmin}
                  onDelete={deleteUser}
                  onToggleDrawer={toggleDrawer}
                  onShowMore={() => void loadActivity(user.id, 30)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs mt-4" style={{ color: '#9ca3af' }}>
        Cards are granted per user — the Admin switch only controls access to this page.
        New sign-ups are invitation-only. Access changes take effect on the user&apos;s next
        session refresh (up to a minute) — immediately on their next sign-in. Activity is kept
        for 90 days.
      </p>
    </main>
  )
}

function FragmentRow({
  user, drawer, busy, onToggleApp, onToggleAdmin, onDelete, onToggleDrawer, onShowMore,
}: {
  user: AdminUser
  drawer: DrawerState | undefined
  busy: string | null
  onToggleApp: (user: AdminUser, appId: string) => void
  onToggleAdmin: (user: AdminUser) => void
  onDelete: (user: AdminUser) => void
  onToggleDrawer: (userId: string) => void
  onShowMore: () => void
}) {
  const open = drawer?.open === true
  return (
    <>
      <tr className="border-t" style={{ borderColor: '#f0f2ff' }}>
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <Image
              src={user.imageUrl}
              alt=""
              width={32}
              height={32}
              className="rounded-full"
              unoptimized
            />
            <div>
              <div className="font-semibold" style={{ color: '#111827' }}>
                {user.name}
                {user.isSelf && (
                  <span className="ml-1.5 text-xs font-normal" style={{ color: '#9ca3af' }}>(you)</span>
                )}
              </div>
              <div className="text-xs" style={{ color: '#6b7280' }}>{user.email}</div>
            </div>
          </div>
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            {CARDS.map((card) => (
              <CardChip
                key={card.id}
                label={card.title}
                active={user.apps.includes(card.id)}
                disabled={busy === `${user.id}:${card.id}`}
                onClick={() => onToggleApp(user, card.id)}
              />
            ))}
          </div>
        </td>
        <td className="px-5 py-4 whitespace-nowrap">
          <div className="font-bold text-sm tabular-nums" style={{ color: '#111827' }}>
            {user.lastSignInAt ? whenLabel(user.lastSignInAt) : 'Never'}
          </div>
          {user.lastEvent && (
            <div className="text-xs" style={{ color: '#9ca3af' }}>
              {eventDescription(user.lastEvent)}
            </div>
          )}
        </td>
        <td className="px-5 py-4">
          <button
            type="button"
            onClick={() => onToggleAdmin(user)}
            disabled={user.isSelf || busy === `${user.id}:admin`}
            title={user.isSelf ? 'You cannot remove your own admin access' : undefined}
            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: user.admin ? CYAN : '#d1d5db' }}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
              style={{ transform: user.admin ? 'translateX(18px)' : 'translateX(3px)' }}
            />
          </button>
        </td>
        <td className="px-5 py-4 text-right">
          <div className="inline-flex items-center gap-2">
            {!user.isSelf && (
              <button
                type="button"
                onClick={() => onDelete(user)}
                disabled={busy === `${user.id}:delete`}
                title="Remove user"
                className="p-1.5 rounded-lg transition-colors hover:bg-red-50 disabled:opacity-50"
                style={{ color: '#b91c1c' }}
              >
                {busy === `${user.id}:delete`
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Trash2 size={15} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleDrawer(user.id)}
              title="Show activity"
              aria-expanded={open}
              className="p-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(30,36,140,0.05)', color: NAVY }}
            >
              <ChevronDown
                size={15}
                style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.18s' }}
              />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-5 pt-0 pb-1">
            <ActivityTimeline
              events={drawer?.events ?? []}
              days={drawer?.days ?? 7}
              loading={drawer?.loading === true}
              onShowMore={onShowMore}
            />
          </td>
        </tr>
      )}
    </>
  )
}
