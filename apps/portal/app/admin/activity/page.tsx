import { clerkClient } from '@clerk/nextjs/server'
import { getActivityEventModel } from '@easybim/db'
import ActivityBoard, { type DailyPoint, type TopCard, type UserRow } from './ActivityBoard'

// Platform Activity — aggregates the shared activityevents collection
// (card_open / app_visit, 90-day TTL) the other way round from the per-user
// drawer: per-app usage over time + active/dormant users.
export const dynamic = 'force-dynamic'

const RANGES = [7, 30, 90]
const ACTIVE_DAYS = 7

export default async function ActivityPage({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams
  const days = RANGES.includes(Number(params.days)) ? Number(params.days) : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const activeSince = Date.now() - ACTIVE_DAYS * 24 * 60 * 60 * 1000

  const ActivityEvent = await getActivityEventModel()

  const [daily, topCards, perUser, userList] = await Promise.all([
    ActivityEvent.aggregate<{ _id: { app: string; day: string; type: string }; total: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            app: '$app',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type',
          },
          total: { $sum: { $ifNull: ['$count', 1] } },
        },
      },
      { $sort: { '_id.day': 1 } },
    ]),
    ActivityEvent.aggregate<{ _id: string; opens: number }>([
      { $match: { createdAt: { $gte: since }, type: 'card_open' } },
      { $group: { _id: '$app', opens: { $sum: 1 } } },
      { $sort: { opens: -1 } },
    ]),
    ActivityEvent.aggregate<{ _id: string; lastAt: Date; total: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$userId', lastAt: { $max: '$updatedAt' }, total: { $sum: { $ifNull: ['$count', 1] } } } },
    ]),
    // TODO: paginate past 200 users if headcount ever requires it.
    (await clerkClient()).users.getUserList({ limit: 200 }),
  ])

  const points: DailyPoint[] = daily.map((d) => ({
    app: d._id.app,
    day: d._id.day,
    type: d._id.type as 'card_open' | 'app_visit',
    total: d.total,
  }))

  const cards: TopCard[] = topCards.map((c) => ({ app: c._id, opens: c.opens }))

  const byUserId = new Map(perUser.map((u) => [u._id, u]))
  const users: UserRow[] = userList.data.map((u) => {
    const activity = byUserId.get(u.id)
    const lastAt = activity ? new Date(activity.lastAt).getTime() : null
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.id
    const email = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
      ?? u.emailAddresses[0]?.emailAddress ?? ''
    return {
      id: u.id,
      name,
      email,
      lastAt,
      total: activity?.total ?? 0,
      state: lastAt == null ? 'dormant' : lastAt >= activeSince ? 'active' : 'recent',
    }
  })
  users.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))

  return (
    <div>
      <h1 className="text-2xl font-black mb-1" style={{ color: '#1e248c' }}>Platform Activity</h1>
      <p className="text-sm mb-5" style={{ color: '#6b7280' }}>
        Card opens and app visits across the platform (data is retained for 90 days).
      </p>
      <ActivityBoard days={days} points={points} cards={cards} users={users} />
    </div>
  )
}
