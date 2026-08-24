import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { samePerson } from '@/lib/people'
import type { MeAgenda } from '@/lib/meTypes'

export const runtime = 'nodejs'
// The background task sweep runs via after() inside this route's lifetime.
export const maxDuration = 300

const TZ = 'Asia/Jerusalem'
const localYMD = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

// The personal agenda.
// - Milestones: MI-001 bills on the user's projects due this month — fast,
//   computed live on every request.
// - Tasks: items assigned to the user across ALL boards (minus timesheet/
//   milestone boards), overdue since Jan 1 plus due this month — a slow
//   account-wide sweep, served from a background-building cache.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const empty: MeAgenda = { milestones: [], tasks: [], tasksBuilding: false, mondayIdFound: false }
  if (!process.env.MONGODB_URI || !process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ agenda: empty, mock: true })
  }

  try {
    let me = { name: '', email: null as string | null }
    try {
      const user = await (await clerkClient()).users.getUser(userId)
      me = {
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        email: user.primaryEmailAddress?.emailAddress ?? null,
      }
    } catch { /* matching falls back to nothing */ }

    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    const { fetchMyMilestones, fetchMyTasksAllBoards } = await import('@/lib/services/mondayService')
    const { swrCacheBackground } = await import('@/lib/server/pageCache')
    await connectDB()

    const docs = await Project.find({}).lean()
    const ma004Ids: string[] = []
    const labelByMa004 = new Map<string, string>()
    let mondayId: string | null = null

    for (const doc of docs) {
      const s = doc.snapshot
      if ((s?.status ?? '').toLowerCase() === 'done') continue
      const mine = [s?.bimManager, s?.mepCoordinator, s?.bimModeller].filter((m) => samePerson(m, me))
      if (mine.length === 0) continue
      if (!mondayId) mondayId = mine.find((m) => m?.mondayId)?.mondayId ?? null

      const ma004 = doc.externalIds?.mondayItemId
      if (ma004) {
        ma004Ids.push(String(ma004))
        labelByMa004.set(String(ma004), `${doc.projectNumber ? `${doc.projectNumber} ` : ''}${doc.projectName ?? ''}`.trim())
      }
    }

    const today = localYMD(new Date())
    const [y, m] = today.split('-').map(Number)
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const overdueSince = `${y}-01-01`   // overdue horizon: current year

    const uid = mondayId
    const [milestones, tasksRes] = await Promise.all([
      fetchMyMilestones(ma004Ids, monthStart, monthEnd).catch((err) => {
        console.warn('[me/agenda] milestones failed:', err)
        return []
      }),
      uid
        ? swrCacheBackground(
            `me-tasks:${userId}`,
            15 * 60_000,
            () => fetchMyTasksAllBoards(uid, overdueSince, today, monthEnd),
          )
        : Promise.resolve({ data: [] as Awaited<ReturnType<typeof fetchMyTasksAllBoards>>, cachedAt: null, building: false }),
    ])

    const agenda: MeAgenda = {
      milestones: milestones.map((mi) => ({
        milestoneName: mi.milestoneName,
        billName: mi.billName,
        project: labelByMa004.get(mi.projectItemId) ?? '',
        team: mi.team,
        date: mi.date,
        status: mi.status,
        url: mi.url,
      })),
      tasks: (tasksRes.data ?? []).map((t) => ({
        name: t.name,
        boardName: t.boardName,
        date: t.date,
        status: t.status,
        overdue: t.overdue,
        url: t.url,
      })),
      tasksBuilding: tasksRes.building,
      mondayIdFound: mondayId != null,
    }
    return NextResponse.json({ agenda })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/me/agenda]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
