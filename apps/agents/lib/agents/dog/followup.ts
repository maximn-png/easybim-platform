import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import AgreementReview, {
  FindingVerdict,
  IAgreementReview,
  ReviewIssue,
  UNRESOLVED_VERDICTS,
  Verdict,
  VERDICTS,
} from '@/lib/models/AgreementReview'
import { getGuidance, guidanceBlock } from '@/lib/core/guidance'
import { getChecklist } from './checklist'
import { AGENT_KEY } from './index'
import * as drive from './drive'
import { LoadedSource } from './drive'
import { buildFollowupSystem, followupInstruction, SentComment } from './prompts'

// Round 2+: the client returned a revised contract after our letter. The question
// is not "what changed" (a diff answers that and buries the point) but "for each
// comment we sent, did they fix it" — one verdict per comment, each resting on a
// quote from the new version, plus a fresh checklist scan to catch what the
// revision introduced while we were looking at the clauses we had flagged.

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 16000

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic()
}

const FOLLOWUP_TOOL: Anthropic.Tool = {
  name: 'report_followup',
  description:
    'דווח את תוצאות בדיקת הגרסה המתוקנת: פסיקה לכל אחת מההערות ששלחנו, ובעיות חדשות שהופיעו בגרסה החדשה.',
  input_schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        description: 'פסיקה אחת לכל הערה ששלחנו, לפי אותו מספור.',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'integer', description: 'מספר ההערה כפי שהופיע ברשימה (מתחיל ב-1)' },
            verdict: {
              type: 'string',
              enum: VERDICTS,
              description: 'fixed / partial / not_fixed / worse / removed / not_found',
            },
            newPage: { type: 'string', description: 'עמוד הסעיף בגרסה החדשה' },
            newSection: { type: 'string', description: 'מספר הסעיף בגרסה החדשה (המספור משתנה בין גרסאות)' },
            evidence: { type: 'string', description: 'ציטוט מדויק מהגרסה החדשה שעליו מבוססת הפסיקה' },
            note: { type: 'string', description: 'מה השתנה, במשפט או שניים' },
            remaining: { type: 'string', description: 'מה עדיין נדרש. ריק כאשר ההערה טופלה במלואה.' },
          },
          required: ['ref', 'verdict'],
        },
      },
      newIssues: {
        type: 'array',
        description: 'בעיות חדשות בגרסה החדשה שלא היו בהערות ששלחנו. רשימה ריקה אם אין.',
        items: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            section: { type: 'string' },
            description: { type: 'string' },
            fix: { type: 'string' },
          },
          required: ['page', 'section', 'description', 'fix'],
        },
      },
    },
    required: ['verdicts', 'newIssues'],
  },
}

function sourceBlocks(label: string, src: LoadedSource): Anthropic.ContentBlockParam[] {
  const header: Anthropic.ContentBlockParam = { type: 'text', text: `===== ${label} — ${src.name} =====` }
  if (src.kind === 'pdf') {
    return [
      header,
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: src.base64 } },
    ]
  }
  return [header, { type: 'text', text: src.text }]
}

/** The comments actually sent: what the human kept after editing, in order. */
export function sentComments(review: IAgreementReview): SentComment[] {
  return (review.issues ?? [])
    .filter((i) => !i.dropped)
    .map((i) => ({ page: i.page, section: i.section, description: i.description, fix: i.fix }))
}

/**
 * A later round's agenda: whatever the previous round left open. A comment that
 * was fixed is done with; partial / not_fixed / worse / not_found carry forward,
 * together with any new problems that round found and the human kept.
 */
export function unresolvedComments(review: IAgreementReview): SentComment[] {
  const carried = (review.verdicts ?? [])
    .filter((v) => !v.dropped && UNRESOLVED_VERDICTS.includes(v.verdict))
    .map((v) => ({
      page: v.newPage || v.source.page,
      section: v.newSection || v.source.section,
      description: v.source.description,
      // Ask for what is still missing when we know it; otherwise repeat the original ask.
      fix: v.remaining || v.source.fix,
    }))
  return [...carried, ...sentComments(review)]
}

/** The agenda for checking a revision of `review`. */
export function agendaFor(review: IAgreementReview): SentComment[] {
  return review.round > 1 ? unresolvedComments(review) : sentComments(review)
}

function parseFollowup(
  input: Record<string, unknown>,
  agenda: SentComment[]
): { verdicts: FindingVerdict[]; newIssues: ReviewIssue[] } {
  const rawVerdicts = Array.isArray(input.verdicts) ? input.verdicts : []
  const byRef = new Map<number, Record<string, unknown>>()
  for (const raw of rawVerdicts) {
    const o = (raw ?? {}) as Record<string, unknown>
    const ref = Number(o.ref)
    if (Number.isFinite(ref)) byRef.set(ref, o)
  }

  // One row per agenda item, in agenda order — a comment the model failed to
  // answer becomes an explicit "not_found" rather than silently disappearing.
  const verdicts: FindingVerdict[] = agenda.map((source, i) => {
    const o = byRef.get(i + 1)
    const raw = String(o?.verdict ?? '')
    const verdict: Verdict = (VERDICTS as string[]).includes(raw) ? (raw as Verdict) : 'not_found'
    return {
      source,
      verdict,
      newPage: String(o?.newPage ?? ''),
      newSection: String(o?.newSection ?? ''),
      evidence: String(o?.evidence ?? ''),
      note: o ? String(o.note ?? '') : 'לא התקבלה פסיקה להערה הזו — יש לבדוק ידנית.',
      remaining: String(o?.remaining ?? ''),
      dropped: false,
    }
  })

  const rawNew = Array.isArray(input.newIssues) ? input.newIssues : []
  const newIssues: ReviewIssue[] = rawNew.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>
    return {
      page: String(o.page ?? ''),
      section: String(o.section ?? ''),
      description: String(o.description ?? ''),
      fix: String(o.fix ?? ''),
      dropped: false,
    }
  })

  return { verdicts, newIssues }
}

export interface FollowupResult {
  verdicts: FindingVerdict[]
  newIssues: ReviewIssue[]
  inputTokens: number
  outputTokens: number
  checklistVersion: number
}

export async function analyzeFollowup(
  previousVersion: LoadedSource | null,
  newVersion: LoadedSource,
  agenda: SentComment[]
): Promise<FollowupResult> {
  const [checklist, guidance] = await Promise.all([getChecklist(), getGuidance(AGENT_KEY)])
  const system = buildFollowupSystem(checklist, guidanceBlock(guidance))

  // The old version is attached only when the user asked for it — it roughly
  // doubles the cost of the run, and each comment already carries its own quote
  // of the old wording.
  const content: Anthropic.ContentBlockParam[] = [
    ...(previousVersion ? sourceBlocks('הגרסה הקודמת של ההסכם (שעליה נכתבו ההערות)', previousVersion) : []),
    ...sourceBlocks('הגרסה החדשה שהתקבלה מהלקוח', newVersion),
    { type: 'text', text: followupInstruction(agenda, !!previousVersion) },
  ]

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    tools: [FOLLOWUP_TOOL],
    messages: [{ role: 'user', content }],
  })

  const call = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === FOLLOWUP_TOOL.name
  )
  if (!call) {
    // Unlike the first-round review there is no cheap structuring fallback worth
    // running here: a verdict without its evidence quote is not worth recording.
    throw new Error(
      'לא התקבלו פסיקות. נסו שוב, או ודאו שהקובץ שנבחר הוא אכן הגרסה המתוקנת של ההסכם.'
    )
  }

  const { verdicts, newIssues } = parseFollowup(call.input as Record<string, unknown>, agenda)
  return {
    verdicts,
    newIssues,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    checklistVersion: checklist.version,
  }
}

export interface StartFollowupArgs {
  parentReviewId: string
  /** the revised contract the client sent back */
  newVersionFileId: string
  /**
   * Which file to treat as the previous version. Chosen by the user — the round
   * it follows is only the default, and an empty string means "don't attach it,
   * judge against the comments alone".
   */
  previousVersionFileId?: string
  userId?: string
}

/** Run a follow-up round against an existing review and persist it as round N+1. */
export async function startFollowup(args: StartFollowupArgs): Promise<IAgreementReview> {
  await connectDB()

  const parent = await AgreementReview.findById(args.parentReviewId)
  if (!parent) throw new Error('הבדיקה הקודמת לא נמצאה')
  if (parent.status !== 'ready')
    throw new Error('אפשר לבדוק גרסה חדשה רק אחרי שהבדיקה הקודמת הושלמה')

  const agenda = agendaFor(parent)
  if (agenda.length === 0) throw new Error('אין הערות פתוחות לבדיקה מול הגרסה החדשה.')
  if (args.newVersionFileId === parent.agreement?.fileId)
    throw new Error('הקובץ שנבחר הוא אותה גרסה שכבר נבדקה. בחרו את הגרסה המתוקנת.')

  // `undefined` = not specified, so fall back to the round we follow;
  // `''` = the user explicitly chose not to attach a previous version.
  const previousFileId =
    args.previousVersionFileId === undefined ? parent.agreement.fileId : args.previousVersionFileId.trim()
  if (previousFileId && previousFileId === args.newVersionFileId)
    throw new Error('הגרסה הקודמת והגרסה החדשה הן אותו קובץ. בחרו שתי גרסאות שונות.')

  const [previousVersion, newVersion] = await Promise.all([
    previousFileId ? drive.loadSource(previousFileId) : Promise.resolve(null),
    drive.loadSource(args.newVersionFileId),
  ])

  const review = await AgreementReview.create({
    projectFolderId: parent.projectFolderId,
    projectName: parent.projectName,
    agreement: { fileId: args.newVersionFileId, name: newVersion.name, mimeType: newVersion.mimeType },
    quote: parent.quote,
    round: parent.round + 1,
    parentReviewId: String(parent._id),
    previousAgreement: previousVersion
      ? { fileId: previousFileId, name: previousVersion.name, mimeType: previousVersion.mimeType }
      : undefined,
    status: 'analyzing',
    createdBy: args.userId,
  })

  const run = await AgentRun.create({
    agentKey: AGENT_KEY,
    pass: 'followup',
    trigger: 'manual',
    status: 'running',
    context: { reviewId: String(review._id), parentReviewId: String(parent._id), round: review.round },
    startedAt: new Date(),
  })
  review.runId = String(run._id)
  await review.save()

  try {
    const result = await analyzeFollowup(previousVersion, newVersion, agenda)
    const fixed = result.verdicts.filter((v) => v.verdict === 'fixed' || v.verdict === 'removed').length

    review.status = 'ready'
    review.verdicts = result.verdicts
    review.issues = result.newIssues
    review.issuesOriginal = result.newIssues.map((i) => ({ ...i }))
    review.checklistVersion = result.checklistVersion
    review.inputTokens = result.inputTokens
    review.outputTokens = result.outputTokens
    await review.save()

    run.status = 'done'
    run.summary =
      `${parent.projectName} — גרסה ${review.round}: ${fixed}/${agenda.length} הערות טופלו` +
      (result.newIssues.length ? `, ${result.newIssues.length} ממצאים חדשים` : '')
    run.inputTokens = result.inputTokens
    run.outputTokens = result.outputTokens
    run.finishedAt = new Date()
    await run.save()

    return review
  } catch (err) {
    const message = err instanceof Error ? err.message : 'בדיקת הגרסה נכשלה'
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
