import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import AgreementReview, { IAgreementReview, Verification } from '@/lib/models/AgreementReview'
import { AGENT_KEY } from './index'
import * as drive from './drive'
import { LoadedSource } from './drive'
import { buildVerifySystem, verifyInstruction, VerifyItem } from './prompts'

// The evidence-verification pass: a second, independent read that audits the
// findings after they land. It never adds or removes findings — it only tags
// each one confirmed/suspect so a hallucinated quote is caught before it ends
// up in a letter to a client. Runs as its own request (the drawer fires it
// right after a review turns ready), so it never stacks on the analysis run's
// 300-second budget.

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 16000
const MAX_TEXT_CHARS = 60_000

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic()
}

const VERIFY_TOOL: Anthropic.Tool = {
  name: 'report_verification',
  description: 'דווח את תוצאת האימות: פסיקה אחת לכל פריט שנבדק, לפי מספרו.',
  input_schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'פסיקה אחת לכל פריט, לפי אותו מספור.',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'integer', description: 'מספר הפריט כפי שהופיע ברשימה (מתחיל ב-1)' },
            status: { type: 'string', enum: ['confirmed', 'suspect'] },
            note: { type: 'string', description: 'חובה כאשר suspect: מה בדיוק לא הסתדר' },
          },
          required: ['ref', 'status'],
        },
      },
    },
    required: ['results'],
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
  return [header, { type: 'text', text: src.text.slice(0, MAX_TEXT_CHARS) }]
}

/** Where a verify item writes its result back on the review document. */
interface Target {
  type: 'verdict' | 'issue'
  index: number
}

/**
 * The items worth auditing, with a map back to their rows. Verdicts with no
 * evidence quote (not_found, and empty-evidence rows) are skipped — a skeptic
 * asked to verify a quote that was never given would mark them suspect for the
 * wrong reason. Dropped issues still get checked: un-dropping one later should
 * not resurrect an unaudited quote.
 */
function collectItems(review: IAgreementReview): { items: VerifyItem[]; targets: Target[] } {
  const items: VerifyItem[] = []
  const targets: Target[] = []

  ;(review.verdicts ?? []).forEach((v, index) => {
    if (v.verdict === 'not_found' || !v.evidence?.trim()) return
    items.push({
      kind: 'verdict',
      page: v.newPage || v.source.page,
      section: v.newSection || v.source.section,
      claim: `נפסק "${v.verdict}" על ההערה: ${v.source.description}`,
      quote: v.evidence,
    })
    targets.push({ type: 'verdict', index })
  })

  ;(review.issues ?? []).forEach((issue, index) => {
    items.push({
      kind: 'finding',
      page: issue.page,
      section: issue.section,
      claim: issue.description,
      quote: '',
    })
    targets.push({ type: 'issue', index })
  })

  return { items, targets }
}

export interface VerifySummary {
  checked: number
  suspect: number
  inputTokens: number
  outputTokens: number
}

/**
 * Run the verification pass end to end and persist it. Assumes the caller
 * already gated (review is ready, no verify in flight) and owns nothing else —
 * status transitions, the AgentRun record and the field writes all happen here,
 * mirroring startReview's shape.
 */
export async function runVerification(reviewId: string): Promise<IAgreementReview> {
  await connectDB()
  const review = await AgreementReview.findById(reviewId)
  if (!review) throw new Error('הבדיקה לא נמצאה')

  const { items, targets } = collectItems(review)
  if (items.length === 0) {
    review.verifyStatus = 'done'
    review.verifyError = undefined
    await review.save()
    return review
  }

  review.verifyStatus = 'running'
  review.verifyError = undefined
  await review.save()

  const run = await AgentRun.create({
    agentKey: AGENT_KEY,
    pass: 'verify',
    trigger: 'manual',
    status: 'running',
    context: { reviewId: String(review._id), project: review.projectName },
    startedAt: new Date(),
  })

  try {
    const agreement = await drive.loadSource(review.agreement.fileId)

    const res = await client()
      .messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildVerifySystem(),
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        tools: [VERIFY_TOOL],
        messages: [
          {
            role: 'user',
            content: [
              ...sourceBlocks('ההסכם שנבדק', agreement),
              { type: 'text', text: verifyInstruction(items) },
            ],
          },
        ],
      })
      .finalMessage()

    const call = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === VERIFY_TOOL.name
    )
    if (!call) throw new Error('האימות לא החזיר תוצאות. נסו להריץ אותו שוב.')

    const raw = (call.input as { results?: unknown })?.results
    const byRef = new Map<number, { status: Verification; note: string }>()
    for (const r of Array.isArray(raw) ? raw : []) {
      const o = (r ?? {}) as Record<string, unknown>
      const ref = Number(o.ref)
      const status = String(o.status ?? '')
      if (!Number.isFinite(ref)) continue
      if (status !== 'confirmed' && status !== 'suspect') continue
      byRef.set(ref, { status, note: String(o.note ?? '') })
    }

    // The user may have edited and saved while the model was reading, so apply
    // onto a FRESH copy of the doc, by index with bounds checks. A row deleted
    // mid-verify shifts later issue indexes — rare and low-harm (a badge lands
    // one row off); accepted as a known limitation of index matching.
    const fresh = await AgreementReview.findById(reviewId)
    if (!fresh) throw new Error('הבדיקה נמחקה בזמן האימות')

    let suspect = 0
    targets.forEach((t, i) => {
      const result = byRef.get(i + 1)
      if (!result) return // unanswered items stay untagged — we don't fake a verdict
      const rows = t.type === 'verdict' ? fresh.verdicts : fresh.issues
      const row = rows?.[t.index]
      if (!row) return
      row.verification = result.status
      row.verificationNote = result.status === 'suspect' ? result.note : ''
      if (result.status === 'suspect') suspect += 1
    })
    fresh.markModified('verdicts')
    fresh.markModified('issues')
    fresh.verifyStatus = 'done'
    fresh.verifyError = undefined
    await fresh.save()

    run.status = 'done'
    run.summary =
      `${review.projectName}: אומתו ${items.length} פריטים` +
      (suspect > 0 ? `, ${suspect} חשודים` : ', הכל מעוגן במסמך')
    run.inputTokens = res.usage?.input_tokens ?? 0
    run.outputTokens = res.usage?.output_tokens ?? 0
    run.finishedAt = new Date()
    await run.save()

    return fresh
  } catch (err) {
    const message = err instanceof Error ? err.message : 'האימות נכשל'
    // Best effort: the doc may have changed (or been deleted) while we worked.
    const doc = await AgreementReview.findById(reviewId)
    if (doc) {
      doc.verifyStatus = 'error'
      doc.verifyError = message
      await doc.save()
    }

    run.status = 'error'
    run.error = message
    run.finishedAt = new Date()
    await run.save()

    throw err
  }
}
