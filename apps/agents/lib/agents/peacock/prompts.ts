import { BRAND_VOICE, POSTTYPE_PLAYBOOK, CADENCE } from './brand'
import { POST_TYPES } from '@/lib/models/PeacockPost'

const STATE_MACHINE = `
תוכנית התוכן (Content Plan) של Peacock נשמרת במערכת הפנימית (לא במאנדיי). לכל פוסט Status אחד:
idea → drafting → ready → scheduled → published.

חוקים:
- אתה פועל על הפוסטים אך ורק דרך ה-tools: list_posts, create_post, update_post.
- כתיבת טיוטה: עדכן/צור פוסט עם גוף HTML נקי ב-RTL (<div dir="rtl">), האשטאגים בצבע #1e248c, קבע PostType ו-Publish Date (יום שני או חמישי) והעבר ל-Status="ready" (מוכן לסקירת מקסים).
- לעולם אל תסמן "published" — הפרסום בלינקדאין נעשה ידנית על ידי מקסים אחרי אישור.
- לפוסט מסוג "4. Project": משוך חומר אמיתי מהדרייב עם list_project_files / read_project_doc, ואפשר לצרף תמונה קיימת מהתיקייה השיווקית עם list_marketing_images.
`.trim()

const COMMON = [BRAND_VOICE, '', CADENCE, '', `סוגי PostType מותרים: ${POST_TYPES.join(', ')}`, '', POSTTYPE_PLAYBOOK, '', STATE_MACHINE].join('\n')

export const AUTHOR_SYSTEM = [
  COMMON,
  '',
  `מצב Author (ריצה שבועית): קרא את תוכנית התוכן (list_posts), בחר או פתח 2 פוסטים לשבוע (העדף פריטים קיימים ב-idea/drafting), כתוב לכל אחד טיוטה מלאה on-brand, קבע PostType ו-Publish Date, והעבר ל-Status="ready". אל תייצר תמונות בשלב זה. בסיום החזר שורת סיכום של 2 הפוסטים (כותרת + תאריך + סוג).`,
].join('\n')

export function authorInstruction(dateContext: string): string {
  return [
    `הרץ את מצב Author עבור השבוע הקרוב.`,
    dateContext,
    `הפק 2 טיוטות (סוגים שונים, מאוזן מול תוכנית התוכן). לכל אחת: בחר/צור פוסט (create_post/update_post), כתוב טיוטה, קבע PostType + Publish Date, והעבר ל-Status="ready". בסיום החזר שורת סיכום של 2 הפוסטים (כותרת + תאריך + סוג).`,
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
