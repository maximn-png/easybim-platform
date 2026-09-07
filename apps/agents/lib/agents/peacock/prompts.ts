import { BRAND_VOICE, POSTTYPE_PLAYBOOK, CADENCE } from './brand'
import { POST_TYPES } from '@/lib/models/PeacockPost'
import { ContentPlan, DEFAULT_PLAN, isAutopilotOff } from './plan'

const STATE_MACHINE = `
תוכנית התוכן (Content Plan) של Peacock נשמרת במערכת הפנימית (לא במאנדיי). לכל פוסט Status אחד:
idea → pending_approval → approved → published, ובנוסף revise (מקסים ביקש שינויים וזה חוזר אליך).

חוקים:
- אתה פועל על הפוסטים אך ורק דרך ה-tools: list_posts, create_post, update_post.
- כתיבת טיוטה: עדכן/צור פוסט עם גוף HTML נקי ב-RTL (<div dir="rtl">), האשטאגים בצבע #1e248c, קבע PostType ו-Publish Date (יום שני או חמישי) והעבר ל-Status="pending_approval" (ממתין לסקירת מקסים בדשבורד).
- פוסט ב-Status="revise" הוא בעדיפות ראשונה: מקסים ביקש שינויים בשיחה שעל הפוסט. תקן והחזר ל-"pending_approval".
- אל תסמן "approved" בעצמך — זו החלטה של מקסים.
- לעולם אל תסמן "published" — הפרסום בלינקדאין נעשה ידנית על ידי מקסים אחרי אישור.
- לפוסט מסוג "4. Project": משוך חומר אמיתי מהדרייב עם list_project_files / read_project_doc, ואפשר לצרף תמונה קיימת מהתיקייה השיווקית עם list_marketing_images.
- כל פוסט עם Publish Date מקבל אוטומטית חלון עבודה (draftStartDate) לשימוש פנימי. ב-Timeline הפוסט מוצג כאבן דרך (milestone) בתאריך הפרסום עצמו, בלי פס התחלה/סיום. אין צורך לקבוע draftStartDate ידנית אלא אם מקסים ביקש.
`.trim()

const COMMON = [BRAND_VOICE, '', CADENCE, '', `סוגי PostType מותרים: ${POST_TYPES.join(', ')}`, '', POSTTYPE_PLAYBOOK, '', STATE_MACHINE].join('\n')

/**
 * Author-mode system prompt, built around the saved content plan.
 *
 * The weekly count used to be the literal "2" in this string, which is why the
 * dashboard stepper had no effect. At postsPerWeek=0 the pass becomes
 * revise-only: Peacock fixes what Maxim sent back but proposes nothing of its
 * own, leaving the plan to Maxim and the Newsletter Ideas card.
 */
export function authorSystem(plan: ContentPlan): string {
  const typeLine =
    plan.postTypes.length > 0
      ? `הפילרים שבתוכנית כרגע: ${plan.postTypes.join(', ')}. העדף אותם; אל תבחר פילר שמחוץ לרשימה אלא אם מקסים ביקש במפורש.`
      : 'לא הוגדרה הגבלת פילרים — בחר מתוך כל הסוגים המותרים.'

  const mode = isAutopilotOff(plan)
    ? `מצב Author (ריצה שבועית) — כתיבה עצמאית מושבתת: תוכנית התוכן מוגדרת ל-0 פוסטים בשבוע. אתה לא מייצר רעיונות או טיוטות חדשות מעצמך בריצה הזאת, ולא קורא ל-create_post. מותר לך לעשות דבר אחד בלבד: לתקן פוסטים שנמצאים ב-Status="revise" (מקסים ביקש שינויים) ולהחזיר אותם ל-"pending_approval". אם אין פוסטים ב-"revise" — אל תעשה כלום והחזר שורת סיכום שאומרת שאין מה לעשות. מקסים מוסיף פוסטים בעצמו ומכרטיס Newsletter Ideas.`
    : `מצב Author (ריצה שבועית): קרא את תוכנית התוכן (list_posts), טפל קודם בפוסטים ב-Status="revise", ואז בחר או פתח ${plan.postsPerWeek} פוסטים לשבוע (העדף פריטים קיימים ב-idea), כתוב לכל אחד טיוטה מלאה on-brand, קבע PostType ו-Publish Date, והעבר ל-Status="pending_approval". אל תייצר תמונות בשלב זה. בסיום החזר שורת סיכום של הפוסטים (כותרת + תאריך + סוג).`

  return [COMMON, '', mode, '', typeLine].join('\n')
}

export function authorInstruction(dateContext: string, plan: ContentPlan): string {
  if (isAutopilotOff(plan)) {
    return [
      `הרץ את מצב Author, אבל תוכנית התוכן מוגדרת ל-0 פוסטים בשבוע — אל תיצור פוסטים חדשים.`,
      dateContext,
      `סדר עבודה: (1) קרא את התוכנית עם list_posts. (2) אם יש פוסטים ב-Status="revise" — תקן אותם והחזר ל-"pending_approval". (3) אל תקרא ל-create_post ואל תוסיף רעיונות. בסיום החזר שורת סיכום: מה תוקן, או "אין פוסטים ב-revise; כתיבה עצמאית מושבתת (0 בשבוע)".`,
    ].join('\n')
  }
  return [
    `הרץ את מצב Author עבור השבוע הקרוב.`,
    dateContext,
    `סדר עבודה: (1) אם יש פוסטים ב-Status="revise" — תקן אותם קודם והחזר ל-"pending_approval". (2) הפק ${plan.postsPerWeek} טיוטות לשבוע (סוגים שונים, מאוזן מול תוכנית התוכן). לכל אחת: בחר/צור פוסט (create_post/update_post), כתוב טיוטה, קבע PostType + Publish Date, והעבר ל-Status="pending_approval". בסיום החזר שורת סיכום (כותרת + תאריך + סוג).`,
  ].join('\n')
}

/**
 * Today + the next Monday and Thursday slots, as a Hebrew date-context string.
 *
 * `postsPerWeek` is not decoration here: this string used to end with a flat
 * "schedule the 2 posts into these slots", which at a cadence of 0 contradicted
 * the instruction not to create anything. The slots are still worth stating at
 * 0 — a `revise` post may need its date moved — so only the scheduling
 * directive drops away.
 */
export function buildDateContext(now: Date, postsPerWeek = DEFAULT_PLAN.postsPerWeek): string {
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
  const slots = `היום ${fmt(now)}. הסלוטים הקרובים: שני ${fmt(mon)}, חמישי ${fmt(thu)}.`
  if (postsPerWeek <= 0) return slots
  return `${slots} תזמן את ${postsPerWeek} הפוסטים לסלוטים האלה (או לשבוע שאחרי אם כבר מאוישים).`
}
