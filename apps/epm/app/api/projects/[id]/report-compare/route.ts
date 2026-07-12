import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { ReportIssueSnapshot } from '@/app/models/Report'

// Compares the issue snapshots of two saved reports of the same project and
// returns the status-flow matrix consumed by the Progress modal's Sankey.
// Issues match across reports by displayId (ACC issue number), else by id.

// Matching key. Backfilled snapshots from exports without ACC issue numbers got
// synthetic row-N ids — those must never match (row position is meaningless), so
// they get a per-report unique key.
const issueKey = (i: ReportIssueSnapshot, reportId: string) =>
  i.displayId || (i.id.startsWith('row-') ? `${reportId}:${i.id}` : i.id)

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await ctx.params
  const fromId = req.nextUrl.searchParams.get('from')
  const toId = req.nextUrl.searchParams.get('to')
  const discipline = req.nextUrl.searchParams.get('discipline')
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

    // Disciplines are listed from the full snapshots (pre-filter) so the modal's
    // dropdown is stable while filtering.
    const disciplines = [...new Set(
      [...fromDoc.issuesSnapshot, ...toDoc.issuesSnapshot]
        .map(i => i.discipline?.trim())
        .filter(Boolean) as string[]
    )].sort((a, b) => a.localeCompare(b))

    const byDiscipline = (i: ReportIssueSnapshot) =>
      !discipline || (i.discipline?.trim() ?? '') === discipline
    const fromIssues = fromDoc.issuesSnapshot.filter(byDiscipline)
    const toIssues = toDoc.issuesSnapshot.filter(byDiscipline)

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
      disciplines,
    })
  } catch (err) {
    console.error('[report-compare]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
