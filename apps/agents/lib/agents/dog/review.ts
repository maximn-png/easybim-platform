import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import AgreementReview, {
  FindingVerdict,
  IAgreementReview,
  ReviewIssue,
  Verdict,
  VERDICTS,
  Verification,
  VERIFICATIONS,
} from '@/lib/models/AgreementReview'
import { getGuidance, guidanceBlock } from '@/lib/core/guidance'
import { getChecklist } from './checklist'
import { AGENT_KEY } from './index'
import * as drive from './drive'
import { LoadedSource } from './drive'
import { buildReviewSystem, reviewInstruction, STRUCTURE_INSTRUCTION } from './prompts'

// The analysis pass: two documents in, a list of findings out.
//
// The Python original split this in two (Opus for the reading, Haiku to shape the
// prose into rows) because the 2024 PDF beta endpoint refused to mix with
// tool_use. PDFs are GA now, so the normal path is a single Opus call that
// answers through the tool. tool_choice stays "auto" — Opus 5 thinks by default,
// and forcing a tool is not compatible with thinking — so the model can still
// answer in prose; when it does, the Haiku structuring pass below picks it up.

const MODEL = 'claude-opus-5'
const STRUCTURE_MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 16000

const MAX_TEXT_CHARS = 60_000

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic()
}

const REPORT_TOOL: Anthropic.Tool = {
  name: 'report_legal_issues',
  description:
    'דווח את רשימת הממצאים המשפטיים בהסכם, ממוינת לפי סדר העמודים. קרא לכלי פעם אחת עם כל הממצאים.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        description: 'רשימת הממצאים. רשימה ריקה אם ההסכם תקין בכל הנושאים שנבדקו.',
        items: {
          type: 'object',
          properties: {
            page: { type: 'string', description: 'מספר העמוד בהסכם' },
            section: { type: 'string', description: 'מספר הסעיף או תיאור מיקומו' },
            description: { type: 'string', description: 'תיאור הבעיה עם ציטוט מהטקסט' },
            fix: { type: 'string', description: 'נוסח מתוקן מוצע' },
            prevNotes: {
              type: 'array',
              description:
                'רק כאשר צורפו הסכמים קודמים: הערה קצרה (עד 12 מילים) לכל הסכם קודם, באותו סדר שבו צורפו.',
              items: { type: 'string' },
            },
          },
          required: ['page', 'section', 'description', 'fix'],
        },
      },
    },
    required: ['issues'],
  },
}

function sourceBlocks(label: string, src: LoadedSource): Anthropic.ContentBlockParam[] {
  const header: Anthropic.ContentBlockParam = { type: 'text', text: `===== ${label} — ${src.name} =====` }
  if (src.kind === 'pdf') {
    return [
      header,
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: src.base64 },
      },
    ]
  }
  return [header, { type: 'text', text: src.text.slice(0, MAX_TEXT_CHARS) }]
}

function issuesFromToolUse(content: Anthropic.ContentBlock[], prevCount: number): ReviewIssue[] | null {
  for (const block of content) {
    if (block.type !== 'tool_use' || block.name !== REPORT_TOOL.name) continue
    const raw = (block.input as { issues?: unknown })?.issues
    if (!Array.isArray(raw)) return []
    return raw.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      const issue: ReviewIssue = {
        page: String(o.page ?? ''),
        section: String(o.section ?? ''),
        description: String(o.description ?? ''),
        fix: String(o.fix ?? ''),
        dropped: false,
      }
      if (prevCount > 0) {
        // Pad/trim to exactly one note per attached contract, so the columns
        // never drift out of alignment with `previousContracts`.
        const notes = Array.isArray(o.prevNotes) ? (o.prevNotes as unknown[]).map((n) => String(n ?? '')) : []
        issue.prevNotes = Array.from({ length: prevCount }, (_, i) => notes[i] ?? '')
      }
      return issue
    })
  }
  return null
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** Sort by the page number mentioned, findings with no number last (same as the Python report). */
function byPage(a: ReviewIssue, b: ReviewIssue): number {
  const n = (s: string) => {
    const m = /\d+/.exec(s)
    return m ? parseInt(m[0], 10) : 9999
  }
  return n(a.page) - n(b.page)
}

export interface AnalysisResult {
  issues: ReviewIssue[]
  inputTokens: number
  outputTokens: number
  checklistVersion: number
}

/** A previously signed contract, loaded and labelled with the project it came from. */
export interface LoadedPrevious {
  label: string
  source: LoadedSource
}

export async function analyze(
  agreement: LoadedSource,
  quote: LoadedSource,
  previous: LoadedPrevious[] = []
): Promise<AnalysisResult> {
  const [checklist, guidance] = await Promise.all([getChecklist(), getGuidance(AGENT_KEY)])
  const system = buildReviewSystem(checklist, guidanceBlock(guidance))

  // Quote first — it is shorter and sets the context the agreement is judged
  // against. Previous contracts come last: they are reference material for the
  // per-finding note, not part of the comparison the findings are drawn from.
  const content: Anthropic.ContentBlockParam[] = [
    ...sourceBlocks('הצעת המחיר ששלחנו', quote),
    ...sourceBlocks('ההסכם שהתקבל מהלקוח', agreement),
    ...previous.flatMap((p, i) => sourceBlocks(`הסכם קודם ${i + 1} — ${p.label}`, p.source)),
    { type: 'text', text: reviewInstruction(previous.map((p) => p.label)) },
  ]

  // Streamed so the request never trips HTTP timeouts, with thinking depth
  // turned up — a legal read is exactly the work worth spending tokens on.
  const c = client()
  const res = await c.messages
    .stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'xhigh' },
      tools: [REPORT_TOOL],
      messages: [{ role: 'user', content }],
    })
    .finalMessage()

  let inputTokens = res.usage?.input_tokens ?? 0
  let outputTokens = res.usage?.output_tokens ?? 0
  let issues = issuesFromToolUse(res.content, previous.length)

  if (!issues) {
    // The model answered in prose. Shape it into rows with a cheap forced-tool
    // pass rather than losing the analysis.
    const prose = textOf(res.content)
    if (!prose) throw new Error('המודל לא החזיר ניתוח. ודא שהקבצים שנבחרו הם ההסכם והצעת המחיר.')
    const structured = await c.messages.create({
      model: STRUCTURE_MODEL,
      max_tokens: 8000,
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: REPORT_TOOL.name },
      messages: [{ role: 'user', content: `${STRUCTURE_INSTRUCTION}\n\n${prose}` }],
    })
    inputTokens += structured.usage?.input_tokens ?? 0
    outputTokens += structured.usage?.output_tokens ?? 0
    issues = issuesFromToolUse(structured.content, previous.length) ?? []
  }

  return {
    issues: issues.sort(byPage),
    inputTokens,
    outputTokens,
    checklistVersion: checklist.version,
  }
}

// ── Review records ────────────────────────────────────────────────────────────

export interface StartReviewArgs {
  projectFolderId: string
  projectName: string
  agreementFileId: string
  quoteFileId: string
  /** optional, max 3 — contracts already signed with this client */
  previous?: { fileId: string; projectLabel: string }[]
  userId?: string
}

/** The old tool's three X-columns; kept as the ceiling so the table stays readable. */
export const MAX_PREVIOUS_CONTRACTS = 3

/**
 * Run one review end to end and persist it. Awaited by the route (maxDuration
 * 300) so the caller gets either a finished review or a real error — a review
 * stuck in `analyzing` would be worse than a failure the dashboard can show.
 */
export async function startReview(args: StartReviewArgs): Promise<IAgreementReview> {
  await connectDB()

  const wanted = (args.previous ?? []).slice(0, MAX_PREVIOUS_CONTRACTS)

  const [agreement, quote, previousSources] = await Promise.all([
    drive.loadSource(args.agreementFileId),
    drive.loadSource(args.quoteFileId),
    Promise.all(wanted.map((p) => drive.loadPreviousContract(p.fileId))),
  ])

  const previous: LoadedPrevious[] = previousSources.map((source, i) => ({
    label: wanted[i].projectLabel || source.name,
    source,
  }))

  const review = await AgreementReview.create({
    projectFolderId: args.projectFolderId,
    projectName: args.projectName,
    agreement: { fileId: args.agreementFileId, name: agreement.name, mimeType: agreement.mimeType },
    quote: { fileId: args.quoteFileId, name: quote.name, mimeType: quote.mimeType },
    previousContracts: previousSources.map((s, i) => ({
      fileId: wanted[i].fileId,
      name: s.name,
      mimeType: s.mimeType,
      projectLabel: previous[i].label,
    })),
    status: 'analyzing',
    createdBy: args.userId,
  })

  const run = await AgentRun.create({
    agentKey: AGENT_KEY,
    pass: 'review',
    trigger: 'manual',
    status: 'running',
    context: { reviewId: String(review._id), project: args.projectName },
    startedAt: new Date(),
  })
  review.runId = String(run._id)
  await review.save()

  try {
    const result = await analyze(agreement, quote, previous)

    review.status = 'ready'
    review.issues = result.issues
    review.issuesOriginal = result.issues.map((i) => ({ ...i }))
    // Queue the evidence-verification pass; the drawer fires it as its own request.
    review.verifyStatus = result.issues.length > 0 ? 'pending' : 'done'
    review.checklistVersion = result.checklistVersion
    review.inputTokens = result.inputTokens
    review.outputTokens = result.outputTokens
    await review.save()

    run.status = 'done'
    run.summary =
      `${args.projectName}: ${result.issues.length} ממצאים (${agreement.name})` +
      (previous.length ? ` · הושווה ל-${previous.length} הסכמים קודמים` : '')
    run.inputTokens = result.inputTokens
    run.outputTokens = result.outputTokens
    run.finishedAt = new Date()
    await run.save()

    return review
  } catch (err) {
    const message = err instanceof Error ? err.message : 'הניתוח נכשל'
    review.status = 'error'
    review.error = message
    await review.save()

    run.status = 'error'
    run.error = message
    run.finishedAt = new Date()
    await run.save()

    throw err
  }
}

export interface ReviewDTO {
  id: string
  projectFolderId: string
  projectName: string
  agreementName: string
  quoteName: string
  /** column headers for the per-finding comparison; empty when nothing was compared */
  previousLabels: string[]
  /** 1 = the first review; 2+ = a check of a revised version the client sent back */
  round: number
  parentReviewId: string | null
  previousAgreementName: string | null
  /** round ≥ 2 only: one per comment we sent */
  verdicts: FindingVerdict[]
  verdictCounts: Record<Verdict, number> | null
  status: string
  error: string | null
  /** state of the evidence-verification pass; null on reviews that predate it */
  verifyStatus: string | null
  verifyError: string | null
  issues: ReviewIssue[]
  issueCount: number
  openCount: number
  edited: boolean
  createdAt: string
  updatedAt: string
}

function isEdited(r: IAgreementReview): boolean {
  const orig = r.issuesOriginal ?? []
  const cur = r.issues ?? []
  if (orig.length !== cur.length) return true
  return cur.some((issue, i) => {
    const o = orig[i]
    return (
      !!issue.dropped ||
      issue.page !== o.page ||
      issue.section !== o.section ||
      issue.description !== o.description ||
      issue.fix !== o.fix ||
      (issue.prevNotes ?? []).join(' ') !== (o.prevNotes ?? []).join(' ')
    )
  })
}

function countVerdicts(verdicts: FindingVerdict[]): Record<Verdict, number> {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>
  for (const v of verdicts) if (!v.dropped) counts[v.verdict] += 1
  return counts
}

export function toDTO(r: IAgreementReview, opts: { slim?: boolean } = {}): ReviewDTO {
  const issues = r.issues ?? []
  const verdicts = r.verdicts ?? []
  return {
    id: String(r._id),
    projectFolderId: r.projectFolderId,
    projectName: r.projectName,
    agreementName: r.agreement?.name ?? '',
    quoteName: r.quote?.name ?? '',
    previousLabels: (r.previousContracts ?? []).map((p) => p.projectLabel || p.name),
    round: r.round ?? 1,
    parentReviewId: r.parentReviewId ?? null,
    previousAgreementName: r.previousAgreement?.name ?? null,
    verdicts: opts.slim ? [] : verdicts,
    verdictCounts: verdicts.length ? countVerdicts(verdicts) : null,
    status: r.status,
    error: r.error ?? null,
    verifyStatus: r.verifyStatus ?? null,
    verifyError: r.verifyError ?? null,
    issues: opts.slim ? [] : issues,
    issueCount: issues.length,
    openCount: issues.filter((i) => !i.dropped).length,
    edited: isEdited(r),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function listReviews(): Promise<ReviewDTO[]> {
  await connectDB()
  const docs = await AgreementReview.find().sort({ createdAt: -1 }).limit(200)
  return docs.map((d) => toDTO(d, { slim: true }))
}

export async function getReview(id: string): Promise<IAgreementReview | null> {
  await connectDB()
  return AgreementReview.findById(id)
}

/**
 * Replace the (human-owned) findings list, and on a follow-up round the verdict
 * rows too. `issuesOriginal` is never touched — it is the frozen model output the
 * edit diff is measured against.
 */
/** Round-trip a verification tag from client data without trusting arbitrary strings. */
function asVerification(v: unknown): Verification | undefined {
  return (VERIFICATIONS as string[]).includes(String(v)) ? (v as Verification) : undefined
}

export async function updateIssues(
  id: string,
  issues: ReviewIssue[],
  verdicts?: FindingVerdict[]
): Promise<IAgreementReview | null> {
  await connectDB()
  const review = await AgreementReview.findById(id)
  if (!review) return null

  if (verdicts) {
    // `source` is never taken from the client: it records what was actually sent
    // and must not drift when someone edits the row's verdict or wording.
    review.verdicts = verdicts.map((v, i) => {
      const original = review.verdicts?.[i]
      const raw = String(v?.verdict ?? '')
      return {
        source: original?.source ?? v.source,
        verdict: ((VERDICTS as string[]).includes(raw) ? raw : original?.verdict ?? 'not_found') as Verdict,
        newPage: String(v?.newPage ?? ''),
        newSection: String(v?.newSection ?? ''),
        evidence: String(v?.evidence ?? ''),
        note: String(v?.note ?? ''),
        remaining: String(v?.remaining ?? ''),
        dropped: !!v?.dropped,
        // Verification is server-owned: keep what the verify pass wrote, never
        // what the client sends (rows are index-aligned; verdicts can't be added).
        verification: original?.verification,
        verificationNote: original?.verificationNote,
      }
    })
  }
  // Keep one note per compared contract even on rows the user added by hand, so
  // the comparison columns stay aligned.
  const prevCount = (review.previousContracts ?? []).length
  review.issues = issues.map((i) => ({
    page: String(i.page ?? ''),
    section: String(i.section ?? ''),
    description: String(i.description ?? ''),
    fix: String(i.fix ?? ''),
    dropped: !!i.dropped,
    // Issue rows can be added/removed, so index-matching the stored doc is not
    // safe — the client carries the verification tag through its local state.
    verification: asVerification(i.verification),
    verificationNote: i.verificationNote ? String(i.verificationNote) : undefined,
    ...(prevCount > 0
      ? { prevNotes: Array.from({ length: prevCount }, (_, n) => String(i.prevNotes?.[n] ?? '')) }
      : {}),
  }))
  await review.save()
  return review
}

export async function deleteReview(id: string): Promise<boolean> {
  await connectDB()
  const res = await AgreementReview.deleteOne({ _id: id })
  return res.deletedCount === 1
}
