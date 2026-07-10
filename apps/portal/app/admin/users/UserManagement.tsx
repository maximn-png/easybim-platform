'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, ShieldCheck, Mail, Trash2, UserPlus, Loader2, Clock, X,
} from 'lucide-react'
import { CARDS } from '@/lib/cards'

export interface AdminUser {
  id: string
  name: string
  email: string
  imageUrl: string
  lastSignInAt: number | null
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

const NAVY = '#1e248c'
const CYAN = '#44b8d3'

function CardChip({
  label, active, disabled, onClick,
}: { label: string; active: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-xs px-2.5 py-1 rounded-full border font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      style={
        active
          ? { background: 'rgba(68,184,211,0.15)', borderColor: CYAN, color: NAVY }
          : { background: 'rgba(255,255,255,0.6)', borderColor: '#e5e7eb', color: '#9ca3af' }
      }
    >
      {label}
    </button>
  )
}

export default function UserManagement({
  users, invitations,
}: { users: AdminUser[]; invitations: PendingInvitation[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Invite form state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteApps, setInviteApps] = useState<string[]>([])
  const [inviteAdmin, setInviteAdmin] = useState(false)

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
    const ok = await call('invite', '/api/admin/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail, apps: inviteApps, admin: inviteAdmin }),
    })
    if (ok) {
      setInviteEmail('')
      setInviteApps([])
      setInviteAdmin(false)
      setInviteOpen(false)
    }
  }

  function revokeInvitation(inv: PendingInvitation) {
    if (!window.confirm(`Revoke the invitation for ${inv.email}?`)) return
    void call(`${inv.id}:revoke`, `/api/admin/invitations/${inv.id}`, { method: 'DELETE' })
  }

  const cardTitle = (id: string) => CARDS.find((c) => c.id === id)?.title ?? id

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
            Grant or revoke access to platform cards, per user. Changes apply within a minute.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
          style={{ background: NAVY }}
        >
          <UserPlus size={15} /> Invite user
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border text-sm flex items-center justify-between"
          style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* Invite form */}
      {inviteOpen && (
        <form
          onSubmit={sendInvite}
          className="mb-6 bg-white/70 backdrop-blur-sm border border-white/90 rounded-2xl p-5 shadow-sm flex flex-col gap-4"
        >
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}>
            <Mail size={15} style={{ color: CYAN }} /> Invite a new user
          </div>
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="person@company.com — any email domain works"
            className="w-full max-w-md px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2"
            style={{ borderColor: '#e5e7eb' }}
          />
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
              Admin (all cards + user management)
            </label>
          </div>
          <div>
            <button
              type="submit"
              disabled={busy === 'invite'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: CYAN }}
            >
              {busy === 'invite' && <Loader2 size={14} className="animate-spin" />}
              Send invitation
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
        <table className="w-full text-sm" style={{ minWidth: 640 }}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: '#9ca3af' }}>
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Card access</th>
              <th className="px-5 py-3 font-semibold">Admin</th>
              <th className="px-5 py-3 font-semibold sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t" style={{ borderColor: '#f0f2ff' }}>
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
                    {user.admin ? (
                      <span className="text-xs" style={{ color: '#6b7280' }}>All cards (admin)</span>
                    ) : (
                      CARDS.map((card) => (
                        <CardChip
                          key={card.id}
                          label={card.title}
                          active={user.apps.includes(card.id)}
                          disabled={busy === `${user.id}:${card.id}`}
                          onClick={() => toggleApp(user, card.id)}
                        />
                      ))
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => toggleAdmin(user)}
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
                  {!user.isSelf && (
                    <button
                      type="button"
                      onClick={() => deleteUser(user)}
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs mt-4" style={{ color: '#9ca3af' }}>
        New sign-ups are invitation-only. Access changes take effect on the user&apos;s next
        session refresh (up to a minute) — immediately on their next sign-in.
      </p>
    </main>
  )
}
