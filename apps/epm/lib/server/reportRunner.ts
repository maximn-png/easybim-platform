import 'server-only'
import { clerkClient } from '@clerk/nextjs/server'
import type { AccIssue } from '@/lib/services/apsService'
import { fetchAccIssues } from '@/lib/services/apsService'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import { getUserGoogleToken, gmailCreateDraft, gmailSendMessage } from '@/lib/services/gmailService'
import { buildEmailHtml } from '@/lib/emailHtml'
import { normalizeStatus, issueDiscipline, dropDraft, paramValue } from '@/lib/reportGrouping'
import {
  REPORT_TEMPLATES, resolveVariant, pdfNameFor, accIssuesUrl, type BodyLink,
} from '@/lib/reportTemplates'
import type { ReportMeta } from './reportHtml'
import { getApsAccessTokenForUser } from './apsTokenStore'
import { renderChartPng } from './chartPng'
import { buildReportMime, toBase64Url } from './reportMime'

// Runs one saved schedule end to end: pull issues → apply the saved filters →
// build chart/PDF/Excel → persist a Report row (so it shows up in Activity &
// Reports and in Progress comparisons) → hand the message to Gmail.
//
// Everything happens as the schedule's OWNER: their stored Autodesk refresh
// token reads the issues, their Google token sends the mail. A missing/revoked
// token is reported as 'needs-auth' so the UI can ask them to reconnect rather
// than showing a generic failure.

export type RunStatus = 'ok' | 'failed' | 'needs-auth'

export interface RunResult {
  status:      RunStatus
  error?:      string
  reportId?:   string
  draftId?:    string
  gmailUrl?:   string
  messageId?:  string
  issueCount?: number
  recipients?: number
}

export interface ScheduleConfig {
  _id?:         string
  projectId:    string
  name:         string
  templateId:   string
  variantId?:   string | null
  groupBy:      string
  filters: {
    assignees:   string[]
    issueTypes:  string[]
    disciplines: string[]
    statuses:    string[]
    extra:       { key: string; values: string[] }[]
  }
  bodyText:     string
  modelLink?:   string
  recipients:   string[]
  deliveryMode: 'send' | 'draft'
  ownerUserId:  string
}

const UNASSIGNED = 'לא משויך'

const GROUP_LABELS_HE: Record<string, string> = {
  assignedTo: 'משויך אל', status: 'סטטוס', issueType: 'סוג נושא', dueDate: 'תאריך יעד',
  discipline: 'דיסציפלינה', createdBy: 'נוצר על ידי',
}
// Mirrors the Export panel's groupLabelHe so scheduled output reads identically.
function groupLabelHe(value: string): string {
  if (GROUP_LABELS_HE[value]) return GROUP_LABELS_HE[value]
  if (value.startsWith('attr:')) {
    const title = value.slice(5)
    if (['discipline', 'disciplines'].includes(title.trim().toLowerCase())) return 'דיסציפלינה'
    return title
  }
  return value
}
const localizeGroup = (n: string) =>
  n === 'Unassigned' ? UNASSIGNED : n === 'No Discipline' ? 'ללא דיסציפלינה' : n === 'Other' ? 'אחר' : n

const gmailDraftUrl = (draftId: string) =>
  `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`

// ── Issue sourcing ──────────────────────────────────────────────────────────

interface ProjectInfo {
  projectName:   string
  projectNumber: string
  accProjectId?: string
  accUrl?:       string
  externalHub:   boolean
  hubId?:        string
}

async function loadProject(projectId: string): Promise<ProjectInfo | null> {
  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()
  const doc = await Project.findById(projectId).lean() as Record<string, unknown> | null
  if (!doc) return null
  const ext = (doc.externalIds ?? {}) as Record<string, unknown>
  return {
    projectName:   String(doc.projectName ?? ''),
    projectNumber: String(doc.projectNumber ?? ''),
    accProjectId:  ext.accProjectId as string | undefined,
    accUrl:        ext.accProjectUrl as string | undefined,
    externalHub:   !!ext.accExternalHub,
    hubId:         ext.accHubId as string | undefined,
  }
}

async function loadImportedIssues(projectId: string): Promise<AccIssue[]> {
  const IssueImport = (await import('@/app/models/IssueImport')).default
  const imp = await IssueImport.findOne({ projectId })
    .select('issues')
    .lean() as { issues?: AccIssue[] } | null
  return imp?.issues ?? []
}

// Same precedence as GET /api/projects/[id]/issues, minus the cookie path.
async function loadIssues(
  projectId: string, project: ProjectInfo, ownerUserId: string,
): Promise<{ issues: AccIssue[] } | { needsAuth: true }> {
  const partnerHub = project.externalHub ? getPartnerHubByAccountId(project.hubId) : null

  // Client hubs we can't reach live → the manually imported spreadsheet.
  if (project.externalHub && !partnerHub) {
    return { issues: await loadImportedIssues(projectId) }
  }
  if (!project.accProjectId) return { issues: [] }

  const token = await getApsAccessTokenForUser(ownerUserId, partnerHub)
  if (!token) return { needsAuth: true }

  try {
    return { issues: await fetchAccIssues(project.accProjectId, token, partnerHub) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('401')) return { needsAuth: true }
    // Partner hubs may still have an older import — stale beats nothing.
    if (partnerHub) {
      const imported = await loadImportedIssues(projectId)
      if (imported.length > 0) return { issues: imported }
    }
    throw err
  }
}

// ── Template screenshot (the instructional image under the chart) ────────────
// Public asset, but background runs have no <img> to fetch it: read from disk,
// falling back to the deployed origin.
async function loadBodyImage(pathname: string): Promise<Buffer | undefined> {
  try {
    const { readFile } = await import('fs/promises')
    const path = await import('path')
    return await readFile(path.join(process.cwd(), 'public', pathname.replace(/^\//, '')))
  } catch { /* fall through */ }
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL
    if (!origin) return undefined
    const res = await fetch(`${origin}${pathname}`)
    if (!res.ok) return undefined
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return undefined
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function runSchedule(schedule: ScheduleConfig): Promise<RunResult> {
  const recipients = schedule.recipients.filter(Boolean)
  if (recipients.length === 0) {
    return { status: 'failed', error: 'No recipients configured' }
  }

  const template = REPORT_TEMPLATES.find(t => t.id === schedule.templateId) ?? REPORT_TEMPLATES[0]
  const resolved = resolveVariant(template, schedule.variantId ?? null)

  const project = await loadProject(schedule.projectId)
  if (!project) return { status: 'failed', error: 'Project not found' }

  const sourced = await loadIssues(schedule.projectId, project, schedule.ownerUserId)
  if ('needsAuth' in sourced) {
    return { status: 'needs-auth', error: 'Autodesk access expired — reconnect Autodesk to resume this schedule' }
  }

  // ── Filter, exactly as the Export panel does ──
  const normalized = sourced.issues.map(i => ({ ...i, assignedTo: i.assignedTo?.trim() || 'Unassigned' }))
  const f = schedule.filters
  const docIssues = dropDraft(normalized).filter(i => {
    if (f.assignees.length && !f.assignees.includes(i.assignedTo || 'Unassigned')) return false
    if (f.issueTypes.length && !f.issueTypes.includes(i.issueType)) return false
    if (f.disciplines.length && !f.disciplines.includes(i.discipline?.trim() || 'No Discipline')) return false
    for (const x of f.extra) {
      if (x.values.length && !x.values.includes(paramValue(i, x.key))) return false
    }
    return true
  })
  // The status filter narrows only the emailed picture — attachments always
  // carry the full status distribution (same rule as the manual export).
  const imageIssues = f.statuses.length
    ? docIssues.filter(i => f.statuses.includes(i.status))
    : docIssues

  if (docIssues.length === 0) {
    return { status: 'failed', error: 'No issues matched the schedule filters — nothing was sent' }
  }

  // ── Body copy, links, filenames ──
  const subject = `${resolved.title} — ${project.projectName}`
  const pdfName = pdfNameFor(template, project.projectName, project.projectNumber)
  const xlsxName = pdfName.replace(/\.pdf$/i, '.xlsx')
  const accLink = project.accProjectId ? accIssuesUrl(project.accProjectId) : project.accUrl
  const links: BodyLink[] = resolved.linkKinds.map(kind =>
    kind === 'model'
      ? { href: schedule.modelLink?.trim() || undefined, highlight: !schedule.modelLink?.trim() }
      : { href: accLink }
  )
  const filtersSummary = [
    f.assignees.length ? `משויך: ${f.assignees.map(a => (a === 'Unassigned' ? UNASSIGNED : a)).join(', ')}` : '',
    f.issueTypes.length ? `סוג: ${f.issueTypes.join(', ')}` : '',
    f.disciplines.length ? `דיסציפלינה: ${f.disciplines.join(', ')}` : '',
    ...f.extra.filter(x => x.values.length).map(x => `${groupLabelHe(x.key)}: ${x.values.join(', ')}`),
  ].filter(Boolean).join(' · ') || 'ללא סינון'

  const meta: ReportMeta = {
    projectName:   project.projectName,
    projectNumber: project.projectNumber,
    templateTitle: resolved.title,
    groupBy:       schedule.groupBy,
    groupLabel:    groupLabelHe(schedule.groupBy),
    filtersSummary,
  }

  // ── Artefacts ──
  const [{ generateReportPdf }, { generateReportXlsx }] = await Promise.all([
    import('./reportPdfServer'),
    import('./reportXlsx'),
  ])
  const chartPng = await renderChartPng({
    issues: imageIssues,
    groupBy: schedule.groupBy,
    title: `נושאים לפי ${groupLabelHe(schedule.groupBy)}`,
    renderName: localizeGroup,
  })
  const pdf = await generateReportPdf(meta, docIssues)
  const xlsx = await generateReportXlsx(docIssues)
  const screenshotPng = template.bodyImage ? await loadBodyImage(template.bodyImage) : undefined

  const chartPngBase64 = chartPng.toString('base64')
  const screenshotPngBase64 = screenshotPng?.toString('base64')
  const hasScreenshot = !!screenshotPngBase64

  // Self-contained copy for the report history viewer.
  const previewHtml = buildEmailHtml({
    bodyText: schedule.bodyText,
    links,
    highlightPhrases: resolved.highlightPhrases,
    hasChart: true,
    hasScreenshot,
    inline: { chartBase64: chartPngBase64, screenshotBase64: screenshotPngBase64 },
  })

  // ── Persist first, so the email can reference hosted image URLs ──
  let ownerName: string | undefined
  try {
    const user = await (await clerkClient()).users.getUser(schedule.ownerUserId)
    ownerName = [user.firstName, user.lastName].filter(Boolean).join(' ')
      || user.primaryEmailAddress?.emailAddress || undefined
  } catch { /* name is optional */ }

  const { connectDB } = await import('@easybim/db')
  const Report = (await import('@/app/models/Report')).default
  await connectDB()

  const reportDoc = await Report.create({
    projectId:    schedule.projectId,
    kind:         'email',
    title:        resolved.title,
    subject,
    recipients,
    previewHtml,
    pdf,
    pdfName,
    xlsx,
    xlsxName,
    chartPng,
    screenshotPng,
    scheduleId:   schedule._id,
    scheduleName: schedule.name,
    issueCount:   docIssues.length,
    issuesSnapshot: docIssues.map(i => ({
      id:         i.id,
      displayId:  i.displayId || undefined,
      status:     normalizeStatus(i.status),
      discipline: issueDiscipline(i),
    })),
    filtersSummary,
    groupBy:      schedule.groupBy,
    createdByUserId: schedule.ownerUserId,
    createdByName:   ownerName,
  })
  const reportId = String(reportDoc._id)

  // ── Deliver ──
  const token = await getUserGoogleToken(schedule.ownerUserId)
  if (!token) {
    return {
      status: 'needs-auth', reportId, issueCount: docIssues.length, recipients: recipients.length,
      error: 'Google account not connected — reconnect Google to resume this schedule',
    }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || ''
  const useHosted = origin.startsWith('https://')
  const bodyHtml = buildEmailHtml({
    bodyText: schedule.bodyText,
    links,
    highlightPhrases: resolved.highlightPhrases,
    hasChart: true,
    hasScreenshot,
    urls: useHosted ? {
      chart: `${origin}/api/report-image/${reportId}?kind=chart`,
      screenshot: hasScreenshot ? `${origin}/api/report-image/${reportId}?kind=screenshot` : undefined,
    } : undefined,
  })

  const raw = toBase64Url(buildReportMime({
    to: recipients, subject, bodyHtml,
    pdf, pdfName, xlsx, xlsxName,
    chartPngBase64, screenshotPngBase64,
    inlineImages: !useHosted,
  }))

  try {
    if (schedule.deliveryMode === 'draft') {
      const { id } = await gmailCreateDraft(token, raw)
      await Report.findByIdAndUpdate(reportId, { draftId: id, gmailUrl: gmailDraftUrl(id) })
      return {
        status: 'ok', reportId, draftId: id, gmailUrl: gmailDraftUrl(id),
        issueCount: docIssues.length, recipients: recipients.length,
      }
    }
    const { id } = await gmailSendMessage(token, raw)
    await Report.findByIdAndUpdate(reportId, { messageId: id, sentAt: new Date() })
    return {
      status: 'ok', reportId, messageId: id,
      issueCount: docIssues.length, recipients: recipients.length,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status: RunStatus =
      msg.includes('401') || msg.includes('403') || msg.includes('insufficient') ? 'needs-auth' : 'failed'
    return { status, error: msg, reportId, issueCount: docIssues.length, recipients: recipients.length }
  }
}

export { groupLabelHe }
