import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { getReview } from '@/lib/agents/dog/review'
import { Verdict } from '@/lib/models/AgreementReview'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = 'claude-opus-5'

/** Hebrew labels for the verdict values (UI copies live in dogMeta.ts, client-side). */
const VERDICT_LABEL: Record<Verdict, string> = {
  fixed: 'תוקן',
  removed: 'הסעיף הוסר',
  partial: 'תוקן חלקית',
  not_fixed: 'לא תוקן',
  worse: 'הוחמר',
  not_found: 'לא אותר',
}

// POST { reviewId, kind: 'issue'|'verdict', index, text } — the "שפר להבא"
// flow. Distills the user's free-text feedback on one finding into a single
// durable Hebrew guidance line and returns it as { suggested }. Nothing is
// persisted here: the user edits/approves the line in the drawer and only then
// saves it through POST /api/dashboard/dog/guidance — from where it is already
// injected into every future review and follow-up prompt.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const reviewId = String(body?.reviewId ?? '')
  const kind = body?.kind === 'verdict' ? 'verdict' : 'issue'
  const index = Number(body?.index)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!reviewId || !Number.isInteger(index) || index < 0 || !text)
    return NextResponse.json({ error: 'reviewId, index ו-text נדרשים' }, { status: 400 })

  const review = await getReview(reviewId)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let context: string
  if (kind === 'verdict') {
    const v = review.verdicts?.[index]
    if (!v) return NextResponse.json({ error: 'פסק הדין לא נמצא' }, { status: 400 })
    context = [
      `סוג הפריט: פסק דין על הערה שנשלחה ללקוח (בדיקת גרסה מתוקנת).`,
      `ההערה המקורית: ${v.source.description}`,
      `הפסיקה שניתנה: ${VERDICT_LABEL[v.verdict] ?? v.verdict}`,
      v.evidence ? `הראיה שהובאה: ${v.evidence}` : '',
      v.remaining ? `מה שסומן כחסר: ${v.remaining}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  } else {
    const i = review.issues?.[index]
    if (!i) return NextResponse.json({ error: 'הממצא לא נמצא' }, { status: 400 })
    context = [
      `סוג הפריט: ממצא בבדיקת הסכם.`,
      [i.page && `עמוד ${i.page}`, i.section && `סעיף ${i.section}`].filter(Boolean).join(', '),
      `הממצא: ${i.description}`,
      i.fix ? `התיקון שהוצע: ${i.fix}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  try {
    const res = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system: [
        'אתה מנסח הנחיות עבודה ל-🐕 כלב, סוכן בדיקת חוזים של EasyBIM.',
        'המשתמש נתן משוב על ממצא מסוים. נסח ממנו הנחיית עבודה אחת: קבועה, כללית (לא ספציפית להסכם הזה), עד ~25 מילים, בעברית משפטית פשוטה.',
        'ההנחיה תוזרק לפרומפט של כל בדיקה עתידית — נסח אותה כהוראה ישירה ("אל תדווח על...", "בדוק תמיד ש...", "כאשר X, ציין Y").',
        'החזר את ההנחיה בלבד, בלי הקדמות, בלי מרכאות ובלי הסברים.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: `ההקשר:\n${context}\n\nהמשוב של המשתמש:\n${text}`,
        },
      ],
    })

    const suggested = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
    if (!suggested) return NextResponse.json({ error: 'לא הצלחתי לנסח הנחיה. נסו לנסח את המשוב אחרת.' }, { status: 500 })

    return NextResponse.json({ suggested })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ניסוח ההנחיה נכשל'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
