import { connectDB } from '@/lib/db/mongoose'
import ReviewChecklist, { ChecklistTopic, IReviewChecklist } from '@/lib/models/ReviewChecklist'
import { AGENT_KEY } from './index'

// The seven subjects the local Python tool checked, and the blacklist of generic
// clauses it deliberately stayed silent about. Carried over verbatim from
// agreement_checker.py (the analysis prompt) — this is the accumulated judgment
// of every agreement Maxim reviewed by hand, and the reason the reports were
// short and useful instead of a wall of standard-contract noise.
//
// Seeded into Mongo on first read; edited from the dashboard after that.

export const DEFAULT_TOPICS: ChecklistTopic[] = [
  {
    title: 'שינויים — שינויים ותיקונים בהיקף העבודה',
    detail: 'האם ההסכם מאפשר דרישה לעבודה נוספת ללא תמורה? (סעיפים 5.1, 5.2 ודומיהם)',
  },
  {
    title: 'פיקוח עליון',
    detail: 'האם פיקוח עליון מוזכר בהסכם אך לא מתומחר בהצעת המחיר?',
  },
  {
    title: 'אחריות לנזקים',
    detail:
      'האם קיימת אחריות ללא הגבלת סכום? (סעיף 6.2 ודומיו). בדוק אם יש תקרת אחריות, ומה היחס בינה לבין שכר הטרחה.',
  },
  {
    title: 'ביטוח ואחריות מקצועית',
    detail: 'תנאי הביטוח המקצועי: סכום, תקופה לאחר סיום, כיסוי נדרש (נספח ד\' ודומיו).',
  },
  {
    title: 'נספח תכולת העבודה',
    detail: 'האם נספח תכולת העבודה תואם את הצעת המחיר? האם קיימות דרישות שלא הוצעו?',
  },
  {
    title: 'נספח אופן תשלום',
    detail: 'האם פיצול התשלומים בנספח תואם את הצעת המחיר? האם יש שינוי יחס?',
  },
  {
    title: 'תנאי תשלום',
    detail: 'מועד התשלום: שוטף+כמה ימים? האם שונה ממה שסוכם בהצעה?',
  },
]

export const DEFAULT_IGNORE: string[] = [
  'זכויות יוצרים וקניין רוחני',
  'זכות קיזוז',
  'הפסקת שירותי היועץ',
  'ביטול חד-צדדי',
  'סמכות שיפוט',
  'ויתור על צו מניעה',
  'הצהרת היעדר תביעות',
  'שיפוי בגין יחסי עובד-מעביד',
  'כל סעיף גנרי שמופיע בכל חוזה ייעוץ סטנדרטי',
]

export interface Checklist {
  topics: ChecklistTopic[]
  ignore: string[]
  version: number
}

function toChecklist(doc: IReviewChecklist): Checklist {
  return { topics: doc.topics, ignore: doc.ignore, version: doc.version }
}

/** The active checklist, seeding the defaults on first use. */
export async function getChecklist(): Promise<Checklist> {
  await connectDB()
  const existing = await ReviewChecklist.findOne({ agentKey: AGENT_KEY })
  if (existing) return toChecklist(existing)
  const created = await ReviewChecklist.create({
    agentKey: AGENT_KEY,
    topics: DEFAULT_TOPICS,
    ignore: DEFAULT_IGNORE,
    version: 1,
  })
  return toChecklist(created)
}

/** Replace the checklist wholesale and bump the version. */
export async function updateChecklist(
  topics: ChecklistTopic[],
  ignore: string[],
  updatedBy?: string
): Promise<Checklist> {
  await connectDB()
  const current = await ReviewChecklist.findOne({ agentKey: AGENT_KEY })
  const version = (current?.version ?? 0) + 1
  const doc = await ReviewChecklist.findOneAndUpdate(
    { agentKey: AGENT_KEY },
    {
      $set: {
        topics: topics.filter((t) => t.title.trim()),
        ignore: ignore.map((s) => s.trim()).filter(Boolean),
        version,
        updatedBy,
      },
    },
    { new: true, upsert: true }
  )
  return toChecklist(doc!)
}

/** Restore the seven seeded subjects (used by the "reset" action in the editor). */
export async function resetChecklist(updatedBy?: string): Promise<Checklist> {
  return updateChecklist(DEFAULT_TOPICS, DEFAULT_IGNORE, updatedBy)
}
