import { NextRequest, NextResponse } from 'next/server'
import { resolveEpmAccess } from '@/lib/server/anaAccess'
import { swrCache } from '@/lib/server/pageCache'

// Admin-only migration/health view: per-project hours in the TimeEntry
// collection (split by source) side-by-side with the LIVE Monday timesheet
// totals, so the Monday→portal migration can be compared number-by-number.
// The Monday sweep is slow (~10s across 4 boards) → swrCache'd; ?refresh=1
// forces a live re-sweep.
export const runtime = 'nodejs'

const MONDAY_TOTALS_TTL_MS = 10 * 60_000

export interface HoursStatusRow {
  projectNumber: string
  projectName: string
  status: string | null
  isActive: boolean
  budgetHours: number | null
  boards: string[]            // TS boards the imported hours came from (+ 'Portal' when portal hours exist)
  mondayLive: number | null   // live TS board total (null = project has no MA-003 link)
  mongoMonday: number         // TimeEntry source:'monday'
  mongoPortal: number         // TimeEntry all other sources
  mongoTotal: number
  delta: number | null        // mongoMonday − mondayLive
  sharedMa003With?: string    // another project number pointing at the same MA-003 item
}

export interface HoursStatusBucket {
  key: string                 // 'internal' or 'interior:<CODE>'
  name: string
  boards: string[]
  mongoMonday: number
  mongoPortal: number
  mongoTotal: number
}

const round = (n: number) => Math.round(n * 100) / 100

export async function GET(req: NextRequest) {
  const { admin } = await resolveEpmAccess()
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  if (!process.env.MONGODB_URI) return NextResponse.json({ rows: [], buckets: [], mock: true })

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    const TimeEntry = (await import('@/app/models/TimeEntry')).default
    await connectDB()

    const refresh = req.nextUrl.searchParams.get('refresh') === '1'

    const [projects, agg, mondayTotals] = await Promise.all([
      Project.find({})
        .select('projectNumber projectName isActive externalIds.ma003ItemId snapshot.status snapshot.budgetHours')
        .lean() as Promise<Array<{
          _id: { toString(): string }
          projectNumber: string
          projectName: string
          isActive?: boolean
          externalIds?: { ma003ItemId?: string }
          snapshot?: { status?: string | null; budgetHours?: number | null }
        }>>,
      // projectKey === String(projectId) for real projects; 'internal' and
      // 'interior:<CODE>' rows fall through to the buckets section.
      TimeEntry.aggregate<{ _id: { key: string; monday: boolean }; hours: number; name: string | null; boards: string[][] }>([
        {
          $group: {
            _id: { key: '$projectKey', monday: { $eq: ['$source', 'monday'] } },
            hours: { $sum: '$hours' },
            name: { $last: '$projectName' },
            boards: { $addToSet: { $ifNull: ['$mondayBoards', []] } },
          },
        },
      ]),
      process.env.MONDAY_API_TOKEN
        ? swrCache<Record<string, number>>('admin:monday-hours-totals', MONDAY_TOTALS_TTL_MS, refresh, async () => {
            const { fetchAllTimesheetHours } = await import('@/lib/services/mondayService')
            const map = await fetchAllTimesheetHours()
            return Object.fromEntries([...map.entries()].map(([id, v]) => [id, v.actualHours]))
          })
        : Promise.resolve({ data: {} as Record<string, number>, cachedAt: null as Date | null }),
    ])

    const byKey = new Map<string, { monday: number; portal: number; name: string | null; boards: Set<string> }>()
    for (const r of agg) {
      const slot = byKey.get(r._id.key) ?? { monday: 0, portal: 0, name: null, boards: new Set<string>() }
      if (r._id.monday) slot.monday += r.hours
      else { slot.portal += r.hours; slot.boards.add('Portal') }
      for (const b of r.boards.flat()) slot.boards.add(b)
      slot.name = slot.name ?? r.name
      byKey.set(r._id.key, slot)
    }
    const boardList = (s?: { boards: Set<string> }) =>
      [...(s?.boards ?? [])].sort((a, b) => (a === 'Portal' ? 1 : b === 'Portal' ? -1 : a.localeCompare(b)))

    // Projects sharing one MA-003 item can't be told apart in Monday's totals.
    const ma003Owners = new Map<string, string[]>()
    for (const p of projects) {
      const id = p.externalIds?.ma003ItemId
      if (id) ma003Owners.set(id, [...(ma003Owners.get(id) ?? []), p.projectNumber])
    }

    const projectKeys = new Set(projects.map(p => String(p._id)))
    const rows: HoursStatusRow[] = []
    for (const p of projects) {
      const entry = byKey.get(String(p._id))
      const ma003Id = p.externalIds?.ma003ItemId
      const mondayLive = ma003Id != null ? mondayTotals.data[ma003Id] ?? 0 : null
      const mongoMonday = round(entry?.monday ?? 0)
      const mongoPortal = round(entry?.portal ?? 0)
      if (!entry && !mondayLive) continue   // no hours anywhere — skip the noise
      const shared = ma003Id ? ma003Owners.get(ma003Id)!.filter(n => n !== p.projectNumber) : []
      rows.push({
        projectNumber: p.projectNumber,
        projectName: p.projectName,
        status: p.snapshot?.status ?? null,
        isActive: p.isActive !== false,
        budgetHours: p.snapshot?.budgetHours ?? null,
        boards: boardList(entry),
        mondayLive: mondayLive != null ? round(mondayLive) : null,
        mongoMonday,
        mongoPortal,
        mongoTotal: round(mongoMonday + mongoPortal),
        delta: mondayLive != null ? round(mongoMonday - mondayLive) : null,
        ...(shared.length ? { sharedMa003With: shared.join(', ') } : {}),
      })
    }

    const buckets: HoursStatusBucket[] = [...byKey.entries()]
      .filter(([key]) => !projectKeys.has(key))
      .map(([key, v]) => ({
        key,
        name: v.name ?? key,
        boards: boardList(v),
        mongoMonday: round(v.monday),
        mongoPortal: round(v.portal),
        mongoTotal: round(v.monday + v.portal),
      }))
      .sort((a, b) => b.mongoTotal - a.mongoTotal)

    const totals = {
      mondayLive: round(rows.reduce((s, r) => s + (r.mondayLive ?? 0), 0)),
      mongoMonday: round(rows.reduce((s, r) => s + r.mongoMonday, 0) + buckets.reduce((s, b) => s + b.mongoMonday, 0)),
      mongoPortal: round(rows.reduce((s, r) => s + r.mongoPortal, 0) + buckets.reduce((s, b) => s + b.mongoPortal, 0)),
      mongoTotal: 0,
    }
    totals.mongoTotal = round(totals.mongoMonday + totals.mongoPortal)

    return NextResponse.json({
      rows, buckets, totals,
      ...(mondayTotals.cachedAt ? { mondayCachedAt: mondayTotals.cachedAt } : {}),
    })
  } catch (err) {
    console.error('[GET /api/admin/hours-status]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
