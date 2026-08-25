import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { samePerson } from '@/lib/people'
import type { AgendaMilestone, MeAgenda, MyRole } from '@/lib/meTypes'

export const runtime = 'nodejs'
// The background task sweep runs via after() inside this route's lifetime.
export const maxDuration = 300

const TZ = 'Asia/Jerusalem'
const localYMD = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

// A milestone belongs to the user only when its צוות matches their role on
// that project ("מקסים/באין" milestones belong to Maxim).
function teamMatchesUser(team: string, roles: MyRole[], userName: string): boolean {
  const t = team.trim()
  if (!t) return true // no team set — can't rule it out
  if (t === 'ניהול מודל') return roles.includes('BIM Manager')
  if (t === 'תיאום מערכות') return roles.includes('MEP Coordinator')
  const n = userName.toLowerCase()
  if (t.includes('מקסים')) return n.includes('maxim') || n.includes('מקסים')
  return true
}

// The personal agenda.
// - Milestones: MI-001 bills on the user's projects, filtered to their team
//   role — this month's on the card, the full history for the hover.
// - Tasks: items assigned to the user on project boards + a few company boards,
//   overdue (this year) plus due this month — served from a background cache.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1'
  const empty: MeAgenda = { milestones: [], milestoneHistory: {}, tasks: [], tasksBuilding: false, tasksCachedAt: null, mondayIdFound: false }
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
    const { fetchMyMilestones, fetchMyTasksAllBoards, fetchUserPhotos } = await import('@/lib/services/mondayService')
    const { swrCacheBackground } = await import('@/lib/server/pageCache')
    await connectDB()

    const docs = await Project.find({}).lean()
    const ma004Ids: string[] = []
    const byMa004 = new Map<string, { number: string; name: string; roles: MyRole[] }>()
    let mondayId: string | null = null

    for (const doc of docs) {
      const s = doc.snapshot
      if ((s?.status ?? '').toLowerCase() === 'done') continue
      const slots: Array<[MyRole, { name?: string; email?: string; mondayId?: string } | undefined]> = [
        ['BIM Manager', s?.bimManager],
        ['MEP Coordinator', s?.mepCoordinator],
        ['BIM Modeller', s?.bimModeller],
      ]
      const mine = slots.filter(([, m]) => samePerson(m, me))
      if (mine.length === 0) continue
      if (!mondayId) mondayId = mine.find(([, m]) => m?.mondayId)?.[1]?.mondayId ?? null

      const ma004 = doc.externalIds?.mondayItemId
      if (ma004) {
        ma004Ids.push(String(ma004))
        byMa004.set(String(ma004), {
          number: doc.projectNumber ?? '',
          name: doc.projectName ?? '',
          roles: mine.map(([r]) => r),
        })
      }
    }

    const today = localYMD(new Date())
    const [y, m] = today.split('-').map(Number)
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const overdueSince = `${y}-01-01`   // overdue horizon: current year

    const uid = mondayId
    const [allBills, tasksRes] = await Promise.all([
      fetchMyMilestones(ma004Ids).catch((err) => {
        console.warn('[me/agenda] milestones failed:', err)
        return []
      }),
      uid
        ? swrCacheBackground(
            // v5: editable due/status columns
            `me-tasks:v5:${userId}`,
            15 * 60_000,
            () => fetchMyTasksAllBoards(uid, overdueSince, today, monthEnd),
            forceRefresh,
          )
        : Promise.resolve({ data: [] as Awaited<ReturnType<typeof fetchMyTasksAllBoards>>, cachedAt: null, building: false }),
    ])

    // Monday profile photos for every employee that appears on a bill.
    const employeeIds = [...new Set(allBills.flatMap((b) => b.employeeIds))]
    const photos = await fetchUserPhotos(employeeIds).catch(() => new Map<string, { name: string; avatarUrl?: string }>())

    const toAgendaMilestone = (b: (typeof allBills)[number], proj: { number: string; name: string }): AgendaMilestone => ({
      milestoneName: b.milestoneName,
      billName: b.billName,
      employees: b.employeeIds.map((id) => ({
        id,
        name: photos.get(id)?.name ?? '',
        avatarUrl: photos.get(id)?.avatarUrl,
      })),
      projectItemId: b.projectItemId,
      project: `${proj.number ? `${proj.number} ` : ''}${proj.name}`.trim(),
      projectNumber: proj.number,
      projectName: proj.name,
      team: b.team,
      date: b.date,
      status: b.status,
      url: b.url,
    })

    // Card rows: only the user's bills — the Employee column decides; bills
    // with no employee fall back to team-vs-role matching.
    // Hover history: ALL bills of the project, everyone's, all dates.
    const myBills: AgendaMilestone[] = []
    const milestoneHistory: Record<string, AgendaMilestone[]> = {}
    for (const b of allBills) {
      const proj = byMa004.get(b.projectItemId)
      if (!proj) continue
      const row = toAgendaMilestone(b, proj)
      ;(milestoneHistory[b.projectItemId] ??= []).push(row)
      const personal = b.employeeIds.length > 0
        ? mondayId != null && b.employeeIds.includes(String(mondayId))
        : teamMatchesUser(b.team, proj.roles, me.name)
      if (personal) myBills.push(row)
    }

    const agenda: MeAgenda = {
      milestones: myBills.filter((b) => b.date >= monthStart && b.date <= monthEnd),
      milestoneHistory,
      tasks: (tasksRes.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        boardId: t.boardId,
        boardName: t.boardName,
        date: t.date,
        dueColumnId: t.dueColumnId ?? null,
        status: t.status,
        statusColumnId: t.statusColumnId ?? null,
        statusLabels: t.statusLabels ?? [],
        overdue: t.overdue,
        priority: t.priority,
        priorityColumnId: t.priorityColumnId,
        priorityLabels: t.priorityLabels ?? [],
        url: t.url,
      })),
      tasksBuilding: tasksRes.building,
      tasksCachedAt: tasksRes.cachedAt ? new Date(tasksRes.cachedAt).toISOString() : null,
      mondayIdFound: mondayId != null,
    }
    return NextResponse.json({ agenda })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/me/agenda]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
