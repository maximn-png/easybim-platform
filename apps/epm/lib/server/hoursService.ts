// Platform-native hours analytics over the TimeEntry collection.
// Replaces the Monday timesheet sweep: after the Monday→TimeEntry backfill
// (scripts/backfillTimeEntriesFromMonday.ts), ALL hours — historical Monday
// imports (source:'monday') and portal-logged entries — live in Mongo, so the
// per-project breakdown and the dashboard actualHours are computed here.
// Budget hours / discipline banks still come from Monday MA-004 (mondayService).
import { Types } from 'mongoose'
import { clerkClient } from '@clerk/nextjs/server'
import TimeEntry from '@/app/models/TimeEntry'
import type { HoursBreakdown } from '@/lib/services/mondayService'

const SUBJECT_FALLBACK  = 'General'
const EMPLOYEE_FALLBACK = 'Unassigned'

// Clerk id → { name, avatarUrl }, refreshed at most every 15 minutes per instance.
let clerkCache: { at: number; users: Map<string, { name: string; avatarUrl?: string }> } | null = null
const CLERK_CACHE_TTL_MS = 15 * 60_000

async function getClerkUsers(): Promise<Map<string, { name: string; avatarUrl?: string }>> {
  if (clerkCache && Date.now() - clerkCache.at < CLERK_CACHE_TTL_MS) return clerkCache.users
  const users = new Map<string, { name: string; avatarUrl?: string }>()
  try {
    const client = await clerkClient()
    let offset = 0
    for (;;) {
      const { data } = await client.users.getUserList({ limit: 500, offset })
      for (const u of data) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ')
        users.set(u.id, { name: name || u.id, avatarUrl: u.imageUrl ?? undefined })
      }
      if (data.length < 500) break
      offset += 500
    }
    clerkCache = { at: Date.now(), users }
  } catch (err) {
    console.error('[hoursService] Clerk user list failed:', err)
    // Serve a stale cache over nothing.
    if (clerkCache) return clerkCache.users
  }
  return users
}

// Per-project monthly breakdown by Subject + Employee — same shape the Monday
// sweep produced, so HoursAnalyticsClient/ProjectDetailClient need no changes.
export async function buildProjectHoursBreakdown(projectId: string): Promise<HoursBreakdown> {
  const rows = await TimeEntry.aggregate<{
    _id: { month: string; subject: string; userId: string }
    hours: number
    userName: string | null
  }>([
    { $match: { projectId: new Types.ObjectId(projectId) } },
    {
      $group: {
        _id: {
          month:   { $substrBytes: ['$date', 0, 7] },
          subject: { $ifNull: [{ $cond: [{ $eq: ['$subject', ''] }, SUBJECT_FALLBACK, '$subject'] }, SUBJECT_FALLBACK] },
          userId:  '$userId',
        },
        hours:    { $sum: '$hours' },
        userName: { $last: '$userName' },
      },
    },
  ])

  const clerkUsers = rows.some(r => !r.userName && !r._id.userId.startsWith('ext:'))
    ? await getClerkUsers()
    : new Map<string, { name: string; avatarUrl?: string }>()

  const subjectByMonth  = new Map<string, Record<string, number>>()
  const employeeByMonth = new Map<string, Record<string, number>>()
  const subjectEmployeeByMonth = new Map<string, Record<string, Record<string, number>>>()
  const totalsBySubject:  Record<string, number> = {}
  const totalsByEmployee: Record<string, number> = {}
  const employeeAvatars:  Record<string, string> = {}

  for (const row of rows) {
    const { month, subject, userId } = row._id
    const clerkUser = clerkUsers.get(userId)
    const employee = (row.userName || clerkUser?.name || '').trim() || EMPLOYEE_FALLBACK
    const hours = row.hours

    const sBucket = subjectByMonth.get(month) ?? {}
    sBucket[subject] = (sBucket[subject] ?? 0) + hours
    subjectByMonth.set(month, sBucket)
    totalsBySubject[subject] = (totalsBySubject[subject] ?? 0) + hours

    const eBucket = employeeByMonth.get(month) ?? {}
    eBucket[employee] = (eBucket[employee] ?? 0) + hours
    employeeByMonth.set(month, eBucket)
    totalsByEmployee[employee] = (totalsByEmployee[employee] ?? 0) + hours

    const seBucket = subjectEmployeeByMonth.get(month) ?? {}
    const subMap = seBucket[subject] ?? {}
    subMap[employee] = (subMap[employee] ?? 0) + hours
    seBucket[subject] = subMap
    subjectEmployeeByMonth.set(month, seBucket)

    const avatar = clerkUser?.avatarUrl
    if (avatar && !employeeAvatars[employee]) employeeAvatars[employee] = avatar
  }

  const round = (n: number) => Math.round(n * 100) / 100
  const roundMap = (m: Record<string, number>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)]))
  const roundNested = (m: Record<string, Record<string, number>>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, roundMap(v)]))

  const allMonths = [...subjectByMonth.keys()].sort()
  const months = allMonths.map(month => ({
    month,
    bySubject:         roundMap(subjectByMonth.get(month) ?? {}),
    byEmployee:        roundMap(employeeByMonth.get(month) ?? {}),
    bySubjectEmployee: roundNested(subjectEmployeeByMonth.get(month) ?? {}),
  }))

  const subjects  = Object.keys(totalsBySubject).sort((a, b) => totalsBySubject[b] - totalsBySubject[a])
  const employees = Object.keys(totalsByEmployee).sort((a, b) => totalsByEmployee[b] - totalsByEmployee[a])
  for (const s of subjects)  totalsBySubject[s]  = round(totalsBySubject[s])
  for (const e of employees) totalsByEmployee[e] = round(totalsByEmployee[e])

  return { months, subjects, employees, totalsBySubject, totalsByEmployee, employeeAvatars }
}

// Total actual hours per project — feeds Project.snapshot.actualHours in the
// hourly sync. Keys are Project _id strings ('internal' entries are excluded
// because they carry no projectId).
export async function sumHoursByProject(): Promise<Map<string, number>> {
  const rows = await TimeEntry.aggregate<{ _id: Types.ObjectId; hours: number }>([
    { $match: { projectId: { $exists: true, $ne: null } } },
    { $group: { _id: '$projectId', hours: { $sum: '$hours' } } },
  ])
  return new Map(rows.map(r => [String(r._id), Math.round(r.hours * 100) / 100]))
}
