import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getUserGoogleToken, gmailCreateDraft } from '@/lib/services/gmailService'
import { buildEmailHtml } from '@/lib/emailHtml'
import { toIssueSnapshot } from '@/lib/reportGrouping'
import type { BodyLink } from '@/lib/reportTemplates'
import type { AccIssue } from '@/lib/services/apsService'
import type { ReportMeta } from '@/lib/server/reportHtml'
import { buildReportMime, toBase64Url } from '@/lib/server/reportMime'

// PDF generation runs headless Chromium → needs Node runtime + time to paginate.
export const runtime = 'nodejs'
export const maxDuration = 60

interface EmailParts {
  bodyText: string
  links: BodyLink[]
  highlightPhrases?: string[]
  hasChart: boolean
  hasScreenshot: boolean
  hasLegend?: boolean
}

interface DraftBody {
  to: string[]
  subject: string
  emailParts: EmailParts
  pdfName: string
  xlsxName: string
  // The report PDF + Excel are generated server-side from these:
  meta: ReportMeta
  issues: AccIssue[]
  chartPngBase64?: string
  screenshotPngBase64?: string
  // For saved report history (see ReportViewModal):
  title?: string
  previewHtml?: string      // self-contained email HTML (images as data: URLs)
  issueCount?: number
  filtersSummary?: string
  groupBy?: string
}

const gmailDraftUrl = (draftId: string) =>
  `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`

// Persist the report up-front (no draftId yet) so we have an id to build public
// image URLs from. Returns the id, or null if persistence is unavailable.
async function createReport(
  projectId: string, userId: string, d: DraftBody, pdf: Buffer, xlsx: Buffer,
  chartPng?: Buffer, screenshotPng?: Buffer,
): Promise<string | null> {
  try {
    if (!process.env.MONGODB_URI || !d.previewHtml || !d.title) return null
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    let createdByName: string | undefined
    try {
      const user = await (await clerkClient()).users.getUser(userId)
      createdByName = [user.firstName, user.lastName].filter(Boolean).join(' ')
        || user.primaryEmailAddress?.emailAddress || undefined
    } catch { /* name is optional */ }

    const doc = await Report.create({
      projectId,
      kind: 'email',
      title: d.title,
      subject: d.subject,
      recipients: d.to,
      previewHtml: d.previewHtml,
      pdf,
      pdfName: d.pdfName,
      xlsx,
      xlsxName: d.xlsxName,
      chartPng,
      screenshotPng,
      issueCount: d.issueCount,
      // Compact snapshot for the Progress comparison (status flow over time).
      issuesSnapshot: d.issues.map(toIssueSnapshot),
      filtersSummary: d.filtersSummary,
      groupBy: d.groupBy,
      createdByUserId: userId,
      createdByName,
    })
    return String(doc._id)
  } catch (err) {
    console.error('[gmail-draft] createReport failed', err)
    return null
  }
}

async function attachDraftId(reportId: string, draftId: string) {
  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()
    await Report.findByIdAndUpdate(reportId, { draftId, gmailUrl: gmailDraftUrl(draftId) })
  } catch (err) {
    console.error('[gmail-draft] attachDraftId failed', err)
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await ctx.params

  const token = await getUserGoogleToken(userId)
  if (!token) return NextResponse.json({ needsGoogleAuth: true })

  let body: DraftBody
  try {
    body = await req.json() as DraftBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.to?.length) return NextResponse.json({ error: 'No recipients' }, { status: 400 })
  if (!body.meta || !Array.isArray(body.issues) || !body.emailParts) {
    return NextResponse.json({ error: 'Missing report data' }, { status: 400 })
  }

  try {
    // 1. Generate the report PDF (Chromium) + Excel (SheetJS) server-side.
    const [{ generateReportPdf }, { generateReportXlsx }] = await Promise.all([
      import('@/lib/server/reportPdfServer'),
      import('@/lib/server/reportXlsx'),
    ])
    const pdf = await generateReportPdf(body.meta, body.issues)
    const xlsx = await generateReportXlsx(body.issues, body.meta.extraColumns ?? [])

    const chartPng = body.chartPngBase64 ? Buffer.from(body.chartPngBase64, 'base64') : undefined
    const screenshotPng = body.screenshotPngBase64 ? Buffer.from(body.screenshotPngBase64, 'base64') : undefined

    // 2. Persist the report first so we can host its images at a stable URL.
    const reportId = await createReport(projectId, userId, body, pdf, xlsx, chartPng, screenshotPng)

    // 3. Build the email HTML. Prefer hosted https image URLs (reliable in all
    //    mail clients); fall back to cid: inline images if we couldn't persist —
    //    or when the origin isn't publicly reachable (localhost dev: Gmail's
    //    image proxy can't fetch it, so the image would never display).
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
    const useHosted = !!reportId && origin.startsWith('https://')
    const urls = useHosted ? {
      chart: body.emailParts.hasChart ? `${origin}/api/report-image/${reportId}?kind=chart` : undefined,
      screenshot: body.emailParts.hasScreenshot ? `${origin}/api/report-image/${reportId}?kind=screenshot` : undefined,
    } : undefined
    const bodyHtml = buildEmailHtml({ ...body.emailParts, urls })

    // 4. Assemble + create the draft.
    const raw = toBase64Url(buildReportMime({
      to: body.to, subject: body.subject, bodyHtml,
      pdf, pdfName: body.pdfName, xlsx, xlsxName: body.xlsxName,
      chartPngBase64: body.chartPngBase64,
      screenshotPngBase64: body.screenshotPngBase64,
      inlineImages: !useHosted,
    }))
    const { id } = await gmailCreateDraft(token, raw)
    if (reportId) await attachDraftId(reportId, id)

    return NextResponse.json({ draftId: id, reportId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 401/403 → token invalid or missing scope → ask the user to (re)connect Google
    if (msg.includes('401') || msg.includes('403') || msg.includes('insufficient')) {
      return NextResponse.json({ needsGoogleAuth: true })
    }
    console.error('[POST gmail-draft]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
