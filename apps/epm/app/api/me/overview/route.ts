import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { normalizeName, samePerson } from '@/lib/people'
import { withMeCors } from '@/lib/server/meCors'
import type { MeOverview, MyProject, MyRole, ProjectOption } from '@/lib/meTypes'

export const runtime = 'nodejs'

// Everything the My Space page and the header panel need about the signed-in
// user: which projects they are staffed on (matched by email when the Monday
// snapshot has one, by normalized name otherwise), their ACC issue stats on
// those projects, and the KPI numbers.
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return withMeCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  let name = ''
  let email: string | null = null
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    name = [user.firstName, user.lastName].filter(Boolean).join(' ')
    email = user.primaryEmailAddress?.emailAddress ?? null
  } catch {
    /* identity stays partial; name-matching just finds nothing */
  }

  if (!process.env.MONGODB_URI) {
    const overview: MeOverview = {
      name: name || 'You',
      email,
      avatarUrl: null,
      myProjects: [],
      allProjects: [],
      kpis: { myProjectCount: 0, myActiveIssues: 0, expectedWeeklyHours: 40 },
    }
    return withMeCors(req, NextResponse.json({ overview, mock: true }))
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    const { resolveAccUrl } = await import('@/lib/services/apsService')
    await connectDB()

    const docs = await Project.find({}).lean()
    const me = { name, email }

    const myProjects: MyProject[] = []
    const allProjects: ProjectOption[] = []
    let avatarUrl: string | null = null

    for (const doc of docs) {
      const snapshot = doc.snapshot
      const status = snapshot?.status ?? ''
      const option: ProjectOption = {
        _id: String(doc._id),
        projectName: doc.projectName ?? '',
        projectNumber: doc.projectNumber ?? '',
      }
      if (status.toLowerCase() !== 'done') allProjects.push(option)

      const slots: Array<[MyRole, { name?: string; email?: string; avatarUrl?: string } | undefined]> = [
        ['BIM Manager', snapshot?.bimManager],
        ['MEP Coordinator', snapshot?.mepCoordinator],
        ['BIM Modeller', snapshot?.bimModeller],
      ]
      const mine = slots.filter(([, m]) => samePerson(m, me))
      if (mine.length === 0) continue
      const roles = mine.map(([role]) => role)
      if (!avatarUrl) avatarUrl = mine.find(([, m]) => m?.avatarUrl)?.[1]?.avatarUrl ?? null

      const stats = snapshot?.issueCreatorStats ?? []
      const needle = normalizeName(name)
      const myStat = needle ? stats.find((s) => normalizeName(s.name) === needle) : undefined

      myProjects.push({
        ...option,
        roles,
        status,
        actualHours: snapshot?.actualHours ?? null,
        budgetHours: snapshot?.budgetHours ?? null,
        myActiveIssues: myStat?.active ?? 0,
        myCompletedIssues: myStat?.completed ?? 0,
        myCreatorName: myStat?.name,
        openIssuesCount: snapshot?.openIssuesCount ?? null,
        accUrl: resolveAccUrl((doc.externalIds ?? {}) as unknown as Record<string, unknown>),
      })
    }

    // Active work first, then by project number.
    myProjects.sort((a, b) => {
      const doneA = a.status.toLowerCase() === 'done' ? 1 : 0
      const doneB = b.status.toLowerCase() === 'done' ? 1 : 0
      if (doneA !== doneB) return doneA - doneB
      return a.projectNumber.localeCompare(b.projectNumber)
    })
    allProjects.sort((a, b) => a.projectNumber.localeCompare(b.projectNumber))

    const overview: MeOverview = {
      name: name || 'You',
      email,
      avatarUrl,
      myProjects,
      allProjects,
      kpis: {
        myProjectCount: myProjects.filter((p) => p.status.toLowerCase() !== 'done').length,
        myActiveIssues: myProjects.reduce((s, p) => s + p.myActiveIssues, 0),
        expectedWeeklyHours: 40, // 160h/month
      },
    }
    return withMeCors(req, NextResponse.json({ overview }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/me/overview]', err)
    return withMeCors(req, NextResponse.json({ error: msg }, { status: 500 }))
  }
}
