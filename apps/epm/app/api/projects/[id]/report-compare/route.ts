import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { ReportIssueSnapshot } from '@/app/models/Report'
import { guardSharedProjectForAna } from '@/lib/server/anaAccess'

// Compares the issue snapshots of two saved reports of the same project and
// returns the status-flow matrix consumed by the Progress modal's Sankey.
// Issues match across reports by displayId (ACC issue number), else by id.

// Matching key. Backfilled snapshots from exports without ACC issue numbers got
// synthetic row-N ids — those must never match (row position is meaningless), so
// they get a per-report unique key.
const issueKey = (i: ReportIssueSnapshot, reportId: string) =>
  i.displayId || (i.id.startsWith('row-') ? `${reportId}:${i.id}` : i.id)

// ── Live-attribute enrichment ────────────────────────────────────────────────
// Filter dimensions come from the saved snapshots, but snapshots written before
// the attribute fields existed (or backfilled from Excel) carry none — so e.g.
// a "Levels" custom attribute never appears in the filter dropdown. To close the
// gap we fetch the project's live ACC issues (Mongo-cached for 10 min) and fill
// in ONLY the fields a snapshot issue is missing; frozen statuses stay frozen.

interface EnrichEntry {
  issueType?: string
  discipline?: string
  assignedTo?: string
  createdBy?: string
  attributes?: Record<string, string>
}
interface EnrichCache { at: string; map: Record<string, EnrichEntry> }

const ENRICH_TTL_MS = 10 * 60 * 1000
const enrichKey = (projectId: string) => `report-compare-enrich:v1:${projectId}`

async function loadEnrichment(projectId: string): Promise<Record<string, EnrichEntry> | null> {
  const { cacheGet, cacheSet } = await import('@/lib/server/pageCache')
  const cached = await cacheGet<EnrichCache>(enrichKey(projectId))
  if (cached && Date.now() - new Date(cached.at).getTime() < ENRICH_TTL_MS) return cached.map

  try {
    const Project = (await import('@/app/models/Project')).default
    const doc = await Project.findById(projectId).select('externalIds').lean() as Record<string, unknown> | null
    const ext = (doc?.externalIds ?? {}) as Record<string, unknown>
    const accProjectId = ext.accProjectId as string | undefined
    if (!accProjectId) return cached?.map ?? null

    const { getPartnerHubByAccountId } = await import('@/lib/services/apsHubs')
    const partnerHub = ext.accExternalHub
      ? getPartnerHubByAccountId(ext.accHubId as string | undefined)
      : null
    // Unreachable external hub (Excel import) — nothing live to enrich from.
    if (ext.accExternalHub && !partnerHub) return cached?.map ?? null

    const { getApsUserToken } = await import('@/lib/services/apsUserToken')
    const accessToken = await getApsUserToken(partnerHub)
    if (!accessToken) return cached?.map ?? null

    const { fetchAccIssues } = await import('@/lib/services/apsService')
    const issues = await fetchAccIssues(accProjectId, accessToken, partnerHub)
    const map: Record<string, EnrichEntry> = {}
    for (const i of issues) {
      const key = i.displayId ? String(i.displayId) : i.id
      map[key] = {
        issueType: i.issueType || undefined,
        discipline: i.discipline || undefined,
        assignedTo: i.assignedTo || undefined,
        createdBy: i.createdBy || undefined,
        attributes: i.attributes && Object.keys(i.attributes).length ? i.attributes : undefined,
      }
    }
    await cacheSet(enrichKey(projectId), { at: new Date().toISOString(), map } satisfies EnrichCache)
    return map
  } catch (err) {
    // Enrichment is best-effort — a stale map (or none) still leaves the modal working.
    console.warn('[report-compare] live enrichment failed:', err)
    return cached?.map ?? null
  }
}

// Fill in the dimensions a snapshot issue is missing from its live counterpart.
function enrichSnapshot(snap: ReportIssueSnapshot[], map: Record<string, EnrichEntry>): ReportIssueSnapshot[] {
  return snap.map(i => {
    const live = map[i.displayId ? String(i.displayId) : i.id]
    if (!live) return i
    return {
      ...i,
      issueType:  i.issueType?.trim()  ? i.issueType  : live.issueType,
      discipline: i.discipline?.trim() ? i.discipline : live.discipline,
      assignedTo: i.assignedTo?.trim() ? i.assignedTo : live.assignedTo,
      createdBy:  i.createdBy?.trim()  ? i.createdBy  : live.createdBy,
      // Live attribute values fill the gaps; values frozen in the snapshot win.
      attributes: live.attributes || i.attributes
        ? { ...(live.attributes ?? {}), ...(i.attributes ?? {}) }
        : undefined,
    }
  })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await ctx.params

  // ANA-only clients may compare reports, but only for ANA-hub projects.
  const denied = await guardSharedProjectForAna('GET', projectId)
  if (denied) return denied

  const fromId = req.nextUrl.searchParams.get('from')
  const toId = req.nextUrl.searchParams.get('to')
  // Generic filter: filterKey is a snapshot dimension ('discipline', 'assignedTo',
  // 'createdBy', 'issueType') or a custom attribute ('attr:<Title>'). The legacy
  // ?discipline= param maps onto it.
  const legacyDiscipline = req.nextUrl.searchParams.get('discipline')
  const filterKey = req.nextUrl.searchParams.get('filterKey') ?? (legacyDiscipline ? 'discipline' : null)
  const filterValue = req.nextUrl.searchParams.get('filterValue') ?? legacyDiscipline
  if (!fromId || !toId) {
    return NextResponse.json({ error: 'from and to report ids are required' }, { status: 400 })
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    const docs = await Report.find({ _id: { $in: [fromId, toId] }, projectId })
      .select('title createdAt issuesSnapshot')
      .lean()

    const fromDoc = docs.find(d => String(d._id) === fromId)
    const toDoc = docs.find(d => String(d._id) === toId)
    if (!fromDoc || !toDoc) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    if (!fromDoc.issuesSnapshot?.length || !toDoc.issuesSnapshot?.length) {
      return NextResponse.json({ error: 'One of the reports has no issue snapshot' }, { status: 422 })
    }

    // Draft issues are excluded from the progress comparison everywhere (flow,
    // disciplines, totals) — they aren't real tracked issues yet.
    const notDraft = (i: ReportIssueSnapshot) =>
      (i.status ?? '').trim().toLowerCase() !== 'draft'
    let fromSnap = fromDoc.issuesSnapshot.filter(notDraft)
    let toSnap = toDoc.issuesSnapshot.filter(notDraft)

    // Backfill dimensions the snapshots are missing (older reports carry no
    // custom attributes) from the live issue list, so filters like "Levels"
    // show up even for reports saved before attributes were snapshotted.
    const enrichMap = await loadEnrichment(projectId)
    if (enrichMap) {
      fromSnap = enrichSnapshot(fromSnap, enrichMap)
      toSnap = enrichSnapshot(toSnap, enrichMap)
    }

    // Value of a filterable dimension on a snapshot issue. Snapshots written
    // before the extra fields existed only carry discipline — absent fields
    // simply don't appear in filterOptions below.
    const paramOf = (i: ReportIssueSnapshot, key: string): string | undefined => {
      if (key === 'discipline') return i.discipline?.trim() || undefined
      if (key === 'assignedTo') return i.assignedTo?.trim() || undefined
      if (key === 'createdBy')  return i.createdBy?.trim() || undefined
      if (key === 'issueType')  return i.issueType?.trim() || undefined
      if (key.startsWith('attr:')) return i.attributes?.[key.slice(5)]?.trim() || undefined
      return undefined
    }

    // Filterable parameters + their values, listed from the full snapshots
    // (pre-filter) so the modal's dropdowns stay stable while filtering.
    const allIssues = [...fromSnap, ...toSnap]
    const baseKeys: Array<{ key: string; label: string }> = [
      { key: 'discipline', label: 'Discipline' },
      { key: 'assignedTo', label: 'Assigned To' },
      { key: 'createdBy',  label: 'Created By' },
      { key: 'issueType',  label: 'Issue Type' },
    ]
    const attrKeys = [...new Set(
      allIssues.flatMap(i => Object.keys(i.attributes ?? {})).map(k => k.trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b)).map(t => ({ key: `attr:${t}`, label: t }))
    const filterOptions = [...baseKeys, ...attrKeys]
      .map(({ key, label }) => ({
        key,
        label,
        values: [...new Set(allIssues.map(i => paramOf(i, key)).filter(Boolean) as string[])]
          .sort((a, b) => a.localeCompare(b)),
      }))
      .filter(o => o.values.length > 0)

    const byFilter = (i: ReportIssueSnapshot) =>
      !filterKey || !filterValue || paramOf(i, filterKey) === filterValue
    const fromIssues = fromSnap.filter(byFilter)
    const toIssues = toSnap.filter(byFilter)

    const fromMap = new Map(fromIssues.map(i => [issueKey(i, fromId), i.status]))
    const toMap = new Map(toIssues.map(i => [issueKey(i, toId), i.status]))

    // Flow matrix: status in "from" → status in "to". Issues appearing only in
    // the newer report flow from '(new)'; issues that vanished flow to '(removed)'.
    const flowCounts = new Map<string, number>()
    const bump = (from: string, to: string) => {
      const k = `${from}→${to}`
      flowCounts.set(k, (flowCounts.get(k) ?? 0) + 1)
    }
    let matchedCount = 0
    for (const [key, toStatus] of toMap) {
      const fromStatus = fromMap.get(key)
      if (fromStatus !== undefined) matchedCount++
      bump(fromStatus ?? '(new)', toStatus)
    }
    for (const [key, fromStatus] of fromMap) {
      if (!toMap.has(key)) bump(fromStatus, '(removed)')
    }

    const flows = [...flowCounts.entries()]
      .map(([k, count]) => {
        const [from, to] = k.split('→')
        return { from, to, count }
      })
      .sort((a, b) => b.count - a.count)

    const report = (doc: typeof fromDoc, issues: ReportIssueSnapshot[]) => ({
      id: String(doc._id),
      title: doc.title as string,
      createdAt: new Date(doc.createdAt as unknown as string).toISOString(),
      total: issues.length,
      // Per-status counts for the aggregate fallback when issues can't be matched.
      counts: issues.reduce<Record<string, number>>((acc, i) => {
        acc[i.status] = (acc[i.status] ?? 0) + 1
        return acc
      }, {}),
    })

    return NextResponse.json({
      from: report(fromDoc, fromIssues),
      to: report(toDoc, toIssues),
      flows,
      matchedCount,
      filterOptions,
    })
  } catch (err) {
    console.error('[report-compare]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
