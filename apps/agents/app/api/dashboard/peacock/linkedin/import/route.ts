import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { parseAnalyticsExport, saveDailyRows } from '@/lib/agents/peacock/analytics'

export const runtime = 'nodejs'

// POST /api/dashboard/peacock/linkedin/import { text, dryRun? }
// Takes a pasted LinkedIn page-analytics export (CSV or straight from the
// spreadsheet) and upserts it into the daily series. This is the path that works
// today — no developer app, no API review.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const text: string = (body?.text ?? '').toString()
  if (!text.trim()) return NextResponse.json({ error: 'Paste the exported rows first.' }, { status: 400 })

  const parsed = parseAnalyticsExport(text)
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error, matched: parsed.matched }, { status: 422 })
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: 'Found the header but no data rows with numbers.', matched: parsed.matched, skipped: parsed.skipped },
      { status: 422 }
    )
  }

  const dates = parsed.rows.map((r) => r.date.getTime())
  const preview = {
    matched: parsed.matched,
    rows: parsed.rows.length,
    skipped: parsed.skipped,
    from: new Date(Math.min(...dates)).toISOString().slice(0, 10),
    to: new Date(Math.max(...dates)).toISOString().slice(0, 10),
    totalImpressions: parsed.rows.reduce((n, r) => n + (r.impressions ?? 0), 0),
  }

  // dryRun lets the UI show what it understood before writing anything.
  if (body?.dryRun) return NextResponse.json({ ...preview, dryRun: true })

  const written = await saveDailyRows(parsed.rows, 'import')
  return NextResponse.json({ ...preview, written })
}
