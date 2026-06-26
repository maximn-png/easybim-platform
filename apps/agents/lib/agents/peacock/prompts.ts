import { BRAND_VOICE, POSTTYPE_PLAYBOOK, CADENCE } from './brand'
import { POST_TYPES } from './board'

const STATE_MACHINE = `
מכונת המצבים (Status) בלוח EasyBIM_Posts, group Posts:
Idea, Drafting, Pending Approval, Approved, Ready to Publish, Scheduled, Published (+ Revise).

חוקים:
- כל פוסט הוא Item. אתה פועל רק על הלוח דרך ה-tools.
- לעולם אל תקדם מעבר ל-"Pending Approval" בלי תשובת אישור מפורשת ממקסים.
- תאריכים: קבע Publish Date דרך set_publish_date (ולא בעת יצירה) וקרא חזרה לאימות. התאריך חייב להיות יום שני או חמישי.
- כשמפרסם טיוטה: גוף HTML נקי ב-RTL (<div dir="rtl">), האשטאגים בצבע #1e248c, ותייג את מקסים דרך post_draft.
`.trim()

const COMMON = [BRAND_VOICE, '', CADENCE, '', `סוגי PostType מותרים: ${POST_TYPES.join(', ')}`, '', POSTTYPE_PLAYBOOK, '', STATE_MACHINE].join('\n')

export const AUTHOR_SYSTEM = [
  COMMON,
  '',
  `מצב Author (ריצה שבועית): קרא את הבקלוג, בחר 2 פוסטים לשבוע (מעדיף Items קיימים), כתוב טיוטה מלאה on-brand לכל אחד, קבע PostType ו-Publish Date, פרסם את הטיוטה ל-Updates עם תיוג, וקבע Status="Pending Approval". אל תייצר תמונות בשלב זה.`,
].join('\n')

export const WATCHER_SYSTEM = [
  COMMON,
  '',
  `מצב Watcher (תגובה לשינוי סטטוס): נקרא עבור Item ספציפי כשמקסים שינה סטטוס ל-Approved או Revise.
אם Approved: קרא את הפוסט המאושר (הטיוטה האחרונה ב-Updates), הפעל את generate_image עם טקסט הפוסט ו-PostType כדי לייצר תמונה מותגת ולצרף אותה ל-Updates, ואז קבע Status="Ready to Publish". סכם בקצרה מה נוצר.
אם Revise: קרא את ההערות האחרונות ב-Updates (כולל replies), שכתב את הטיוטה לפיהן, פרסם מחדש עם תיוג, והשאר Status="Pending Approval".`,
].join('\n')

export function authorInstruction(dateContext: string): string {
  return [
    `הרץ את מצב Author עבור השבוע הקרוב.`,
    dateContext,
    `הפק 2 טיוטות (סוגים שונים, מאוזן מול הבקלוג). לכל אחת: בחר/צור Item, כתוב טיוטה, קבע PostType + Publish Date, פרסם ל-Updates + תייג, Status="Pending Approval". בסיום החזר שורת סיכום של 2 ה-Items (שם + תאריך + סוג).`,
  ].join('\n')
}

export function watcherInstruction(itemId: string, signal: string): string {
  return [
    `הרץ את מצב Watcher עבור Item ${itemId}. הסטטוס שונה ל-"${signal}".`,
    `קרא את הפריט ואת ה-Updates האחרונים, ופעל לפי החוקים (Approved -> generate_image + צירוף + Status=Ready to Publish; Revise -> שכתב לפי ההערות + פרסם מחדש + השאר Pending Approval). החזר שורת סיכום קצרה.`,
  ].join('\n')
}

/** Compute today + the next Monday and Thursday slots, as a Hebrew date-context string. */
export function buildDateContext(now: Date): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const dow = now.getDay() // 0=Sun .. 6=Sat
  const nextDow = (target: number) => {
    const diff = (target - dow + 7) % 7 || 7 // strictly upcoming
    const d = new Date(now)
    d.setDate(d.getDate() + diff)
    return d
  }
  const mon = nextDow(1)
  const thu = nextDow(4)
  return `היום ${fmt(now)}. הסלוטים הקרובים: שני ${fmt(mon)}, חמישי ${fmt(thu)}. תזמן את 2 הפוסטים לסלוטים האלה (או לשבוע שאחרי אם כבר מאוישים).`
}
