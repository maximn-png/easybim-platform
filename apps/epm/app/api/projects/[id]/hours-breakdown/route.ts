import { NextRequest, NextResponse } from 'next/server'
import {
  fetchProjectBanks,
  type HoursBreakdown, type DisciplineBanks,
} from '@/lib/services/mondayService'
import { buildProjectHoursBreakdown } from '@/lib/server/hoursService'
import { swrCache } from '@/lib/server/pageCache'

// The hours breakdown is computed live from the TimeEntry collection (portal
// entries + historical Monday imports) — a single indexed aggregation, no
// cache needed. Only the discipline banks still come from Monday MA-004 and
// keep a stale-while-revalidate snapshot (see pageCache.ts).
const BANKS_CACHE_TTL_MS = 30 * 60_000

// Small mock used for local dev when MongoDB is absent,
// so the analytics page still renders something.
const MOCK_BREAKDOWN: HoursBreakdown = {
  months: [
    { month: '2023-07', bySubject: { Superposition: 6 },                  byEmployee: { 'Yamit bettman': 6 },                          bySubjectEmployee: { Superposition: { 'Yamit bettman': 6 } } },
    { month: '2023-08', bySubject: { Superposition: 4, 'Model MGMT': 1 }, byEmployee: { 'Yamit bettman': 3, 'Ethan Berry': 2 },         bySubjectEmployee: { Superposition: { 'Yamit bettman': 3, 'Ethan Berry': 1 }, 'Model MGMT': { 'Ethan Berry': 1 } } },
    { month: '2023-09', bySubject: { 'Model MGMT': 3 },                   byEmployee: { 'Ethan Berry': 3 },                            bySubjectEmployee: { 'Model MGMT': { 'Ethan Berry': 3 } } },
    { month: '2023-10', bySubject: { 'Model MGMT': 1, Modelling: 2 },     byEmployee: { 'Lilina Priyadarshini': 2, 'Ethan Berry': 1 },  bySubjectEmployee: { 'Model MGMT': { 'Ethan Berry': 1 }, Modelling: { 'Lilina Priyadarshini': 2 } } },
    { month: '2023-11', bySubject: { Superposition: 3.5, 'Model MGMT': 2 }, byEmployee: { 'Yamit bettman': 3.5, 'Ethan Berry': 2 },     bySubjectEmployee: { Superposition: { 'Yamit bettman': 3.5 }, 'Model MGMT': { 'Ethan Berry': 2 } } },
    { month: '2023-12', bySubject: { 'Model MGMT': 2, Modelling: 4 },     byEmployee: { 'Lilina Priyadarshini': 4, 'Ethan Berry': 2 },  bySubjectEmployee: { 'Model MGMT': { 'Ethan Berry': 2 }, Modelling: { 'Lilina Priyadarshini': 4 } } },
  ],
  subjects: ['Superposition', 'Model MGMT', 'Modelling'],
  employees: ['Ethan Berry', 'Yamit bettman', 'Lilina Priyadarshini'],
  totalsBySubject: { Superposition: 13.5, 'Model MGMT': 9, Modelling: 6 },
  totalsByEmployee: { 'Ethan Berry': 10, 'Yamit bettman': 12.5, 'Lilina Priyadarshini': 6 },
  employeeAvatars: {},
}

const MOCK_BANKS: DisciplineBanks = { modelMgmt: 300, superposition: 333.33, total: 700 }

const EMPTY_BANKS: DisciplineBanks = { modelMgmt: null, superposition: null, total: null }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ breakdown: MOCK_BREAKDOWN, banks: MOCK_BANKS, mock: true })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const doc = await Project.findById(id).lean() as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const ext = (doc.externalIds ?? {}) as Record<string, unknown>
    const ma004ItemId = ext.mondayItemId as string | undefined

    const refresh = req.nextUrl.searchParams.get('refresh') === '1'
    const canFetchBanks = !!ma004ItemId && !!process.env.MONDAY_API_TOKEN

    const [breakdown, banksResult] = await Promise.all([
      buildProjectHoursBreakdown(id),
      canFetchBanks
        ? swrCache<DisciplineBanks>(`banks:${id}`, BANKS_CACHE_TTL_MS, refresh, () => fetchProjectBanks(ma004ItemId!))
        : Promise.resolve({ data: EMPTY_BANKS, cachedAt: null as Date | null }),
    ])

    return NextResponse.json({
      breakdown,
      banks: banksResult.data,
      ...(banksResult.cachedAt ? { cachedAt: banksResult.cachedAt } : {}),
    })
  } catch (err) {
    console.error('[GET /api/projects/[id]/hours-breakdown]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
