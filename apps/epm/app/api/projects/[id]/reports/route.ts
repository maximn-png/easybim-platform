import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { guardSharedProjectForAna } from '@/lib/server/anaAccess'
import { normalizeStatus, issueDiscipline, dropDraft } from '@/lib/reportGrouping'
import type { AccIssue } from '@/lib/services/apsService'
import type { ReportMeta } from '@/lib/server/reportHtml'

// Internal (analytics-only) report generation runs headless Chromium for the PDF.
export const runtime = 'nodejs'
export const maxDuration = 60

// Lightweight report history for a project (metadata only — no PDF / HTML).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const denied = await guardSharedProjectForAna('GET', id)
  if (denied) return denied
  if (!process.env.MONGODB_URI) return NextResponse.json({ reports: [] })

  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    const docs = await Report.find({ projectId: id })
      .select('kind title subject recipients draftId gmailUrl issueCount createdByName createdAt issuesSnapshot')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean() as unknown as Array<Record<string, unknown>>

    const reports = docs.map(d => ({
      _id: String(d._id),
      // Fallback for rows saved before `kind` existed: internal reports have no
      // recipients (the email flow always has ≥1), so empty ⇒ internal.
      kind: (d.kind as 'email' | 'internal') ?? (((d.recipients as string[])?.length ?? 0) > 0 ? 'email' : 'internal'),
      title: d.title as string,
      subject: d.subject as string,
      recipients: (d.recipients as string[]) ?? [],
      draftId: d.draftId as string | undefined,
      gmailUrl: d.gmailUrl as string | undefined,
      issueCount: d.issueCount as number | undefined,
      createdByName: d.createdByName as string | undefined,
      createdAt: d.createdAt ? new Date(d.createdAt as string).toISOString() : null,
      // Same flag the project page computes server-side — keeps this route's
      // shape consistent with ReportListItem (Progress modal eligibility).
      hasSnapshot: Array.isArray(d.issuesSnapshot) && d.issuesSnapshot.length > 0,
    }))

    return NextResponse.json({ reports })
  } catch (err) {
    console.error('[GET /api/projects/[id]/reports]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// ── Save an INTERNAL (analytics-only) report ──────────────────────────────────
// Same PDF/Excel + issue snapshot as the emailed report, but no Gmail draft and
// no recipients — it exists purely to feed the Progress comparison and history.
interface InternalReportBody {
  meta: ReportMeta
  issues: AccIssue[]
  title: string
  previewHtml: string
  chartPngBase64?: string
  screenshotPngBase64?: string
  issueCount?: number
  filtersSummary?: string
  groupBy?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params

  // ANA-only clients are read-only — the guard rejects their non-GET requests.
  const denied = await guardSharedProjectForAna('POST', projectId)
  if (denied) return denied
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Persistence unavailable' }, { status: 503 })

  let body: InternalReportBody
  try {
    body = await req.json() as InternalReportBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.meta || !Array.isArray(body.issues) || !body.title || !body.previewHtml) {
    return NextResponse.json({ error: 'Missing report data' }, { status: 400 })
  }

  try {
    // Draft issues never enter the report (analytics or attachments).
    const issues = dropDraft(body.issues)

    const [{ generateReportPdf }, { generateReportXlsx }] = await Promise.all([
      import('@/lib/server/reportPdfServer'),
      import('@/lib/server/reportXlsx'),
    ])
    const pdf = await generateReportPdf(body.meta, issues)
    const xlsx = await generateReportXlsx(issues)

    const chartPng = body.chartPngBase64 ? Buffer.from(body.chartPngBase64, 'base64') : undefined
    const screenshotPng = body.screenshotPngBase64 ? Buffer.from(body.screenshotPngBase64, 'base64') : undefined

    let createdByName: string | undefined
    try {
      const user = await (await clerkClient()).users.getUser(userId)
      createdByName = [user.firstName, user.lastName].filter(Boolean).join(' ')
        || user.primaryEmailAddress?.emailAddress || undefined
    } catch { /* name is optional */ }

    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    const pdfName = `${body.title}.pdf`
    const doc = await Report.create({
      projectId,
      kind: 'internal',
      title: body.title,
      subject: body.title,
      recipients: [],
      previewHtml: body.previewHtml,
      pdf,
      pdfName,
      xlsx,
      xlsxName: pdfName.replace(/\.pdf$/i, '.xlsx'),
      chartPng,
      screenshotPng,
      issueCount: body.issueCount ?? issues.length,
      issuesSnapshot: issues.map(i => ({
        id:         i.id,
        displayId:  i.displayId || undefined,
        status:     normalizeStatus(i.status),
        discipline: issueDiscipline(i),
      })),
      filtersSummary: body.filtersSummary,
      groupBy: body.groupBy,
      createdByUserId: userId,
      createdByName,
    })

    return NextResponse.json({ reportId: String(doc._id) })
  } catch (err) {
    console.error('[POST /api/projects/[id]/reports]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
