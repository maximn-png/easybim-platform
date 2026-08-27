'use client'

// Activity board: per-app daily trend (stacked CSS bars), top cards, and the
// active/recent/dormant user table. Data arrives server-aggregated; the range
// toggle is plain links so the aggregation stays on the server.
import Link from 'next/link'
import { useMemo } from 'react'
import { CARDS } from '@/lib/cards'
import { fmtDateTime } from '@/lib/dates'

export interface DailyPoint { app: string; day: string; type: 'card_open' | 'app_visit'; total: number }
export interface TopCard { app: string; opens: number }
export interface UserRow {
  id: string
  name: string
  email: string
  lastAt: number | null
  total: number
  state: 'active' | 'recent' | 'dormant'
}

const NAVY = '#1e248c'
const RANGES = [7, 30, 90]

const cardMeta = (app: string) => {
  const card = CARDS.find((c) => c.id === app)
  return { title: card?.title ?? app, color: card?.color ?? '#9ca3af' }
}

const STATE_BADGE: Record<UserRow['state'], { label: string; cls: string }> = {
  active:  { label: 'Active',  cls: 'bg-green-50 text-green-600' },
  recent:  { label: 'Recent',  cls: 'bg-blue-50 text-blue-600' },
  dormant: { label: 'Dormant', cls: 'bg-gray-100 text-gray-500' },
}

export default function ActivityBoard({
  days, points, cards, users,
}: { days: number; points: DailyPoint[]; cards: TopCard[]; users: UserRow[] }) {
  // day → app → total (opens + visits folded together for the trend).
  const { dayList, byDay, apps, maxDay } = useMemo(() => {
    const byDay = new Map<string, Map<string, number>>()
    const apps = new Set<string>()
    for (const p of points) {
      apps.add(p.app)
      const slot = byDay.get(p.day) ?? new Map<string, number>()
      slot.set(p.app, (slot.get(p.app) ?? 0) + p.total)
      byDay.set(p.day, slot)
    }
    const dayList = [...byDay.keys()].sort()
    const maxDay = Math.max(1, ...dayList.map((d) => [...byDay.get(d)!.values()].reduce((s, v) => s + v, 0)))
    return { dayList, byDay, apps: [...apps].sort(), maxDay }
  }, [points])

  const totalEvents = points.reduce((s, p) => s + p.total, 0)
  const activeCount = users.filter((u) => u.state === 'active').length
  const busiest = useMemo(() => {
    const perApp = new Map<string, number>()
    for (const p of points) perApp.set(p.app, (perApp.get(p.app) ?? 0) + p.total)
    return [...perApp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }, [points])

  return (
    <div className="flex flex-col gap-4">
      {/* Range toggle + stat tiles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin/activity?days=${r}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                r === days ? 'bg-white shadow-sm' : 'hover:bg-white/60'
              }`}
              style={{ color: NAVY, borderColor: 'rgba(30,36,140,0.15)' }}
            >
              {r} days
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `Active users (last 7d)`, value: String(activeCount) },
          { label: `Events (${days}d)`, value: totalEvents.toLocaleString('en-GB') },
          { label: 'Busiest app', value: busiest ? cardMeta(busiest).title : '—' },
          { label: 'Users tracked', value: String(users.length) },
        ].map((t) => (
          <div key={t.label} className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl px-4 py-3 shadow-sm">
            <div className="text-[11px]" style={{ color: '#6b7280' }}>{t.label}</div>
            <div className="text-lg font-bold" style={{ color: NAVY }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* Daily stacked trend */}
      <div className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-bold mb-3" style={{ color: NAVY }}>Usage per day</h2>
        {dayList.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: '#6b7280' }}>No activity recorded in this range.</p>
        ) : (
          <>
            <div className="flex items-end gap-[2px] h-32">
              {dayList.map((day) => {
                const slot = byDay.get(day)!
                const dayTotal = [...slot.values()].reduce((s, v) => s + v, 0)
                return (
                  <div
                    key={day}
                    className="flex-1 flex flex-col-reverse rounded-t overflow-hidden"
                    style={{ height: `${Math.max(3, (dayTotal / maxDay) * 100)}%` }}
                    title={`${day}: ${dayTotal} events`}
                  >
                    {apps.map((app) => {
                      const v = slot.get(app) ?? 0
                      if (!v) return null
                      return (
                        <div
                          key={app}
                          style={{ height: `${(v / dayTotal) * 100}%`, background: cardMeta(app).color }}
                          title={`${cardMeta(app).title}: ${v}`}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] mt-1" style={{ color: '#9ca3af' }}>
              <span>{dayList[0]}</span>
              <span>{dayList[dayList.length - 1]}</span>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {apps.map((app) => (
                <span key={app} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: '#4b5563' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: cardMeta(app).color }} />
                  {cardMeta(app).title}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top cards */}
        <div className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold mb-2" style={{ color: NAVY }}>Top cards ({days}d)</h2>
          {cards.length === 0 ? (
            <p className="text-xs" style={{ color: '#6b7280' }}>No card opens in this range.</p>
          ) : (
            <ul className="space-y-1.5">
              {cards.map((c) => (
                <li key={c.app} className="flex items-center justify-between text-[12px]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: cardMeta(c.app).color }} />
                    {cardMeta(c.app).title}
                  </span>
                  <span className="tabular-nums text-gray-600">{c.opens}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Users */}
        <div className="lg:col-span-2 bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold mb-2" style={{ color: NAVY }}>Users</h2>
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200/70 text-left">
                  <th className="px-2 py-1.5 font-semibold text-gray-500">User</th>
                  <th className="px-2 py-1.5 font-semibold text-gray-500">Status</th>
                  <th className="px-2 py-1.5 font-semibold text-gray-500">Last activity</th>
                  <th className="px-2 py-1.5 font-semibold text-gray-500 text-right">Events ({days}d)</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const badge = STATE_BADGE[u.state]
                  return (
                    <tr key={u.id} className="border-b border-gray-100/80">
                      <td className="px-2 py-1.5">
                        <span className="font-medium text-gray-800">{u.name}</span>
                        <span className="block text-[10px] text-gray-400">{u.email}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                        {u.lastAt ? fmtDateTime(u.lastAt) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{u.total || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
