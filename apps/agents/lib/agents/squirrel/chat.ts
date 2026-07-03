import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import { addGuidance, getGuidance, guidanceBlock } from './guidance'
import { QUOTE_STRUCTURE } from './prompts'
import {
  readQuoteItem,
  findQuote,
  setupProject,
  readReceivedMaterials,
  proposeScope,
  notifyMaxim,
} from './tools'
import { analyticsTools } from './analytics'

export const AGENT_KEY = 'squirrel'

const CHAT_BASE = `
אתה 🐿️ Squirrel, סוכן ניהול הצעות המחיר של EasyBIM, בשיחה עם מקסים (המפעיל שלך).
תפקידך כאן: לעזור למקסים לעקוב אחר הצעות המחיר ("היכן עומדת ההצעה של X"), להסביר ריצות אחרונות, להקים פרויקט לפי דרישה, ולהציע היקף עבודה מהחומר שהתקבל.

עקרון אמת (קריטי, גובר על הכל):
- דווח אך ורק על מה שקרה בפועל לפי תוצאות ה-tools בתור הנוכחי. אסור להמציא. אסור להסתמך על הזיכרון או על תורות קודמים כהוכחה שמשהו נוצר.
- אל תאמר שנוצרה תיקייה/קישור/גיליון/קובץ אלא אם קראת ל-setup_project בתור הזה והוא החזיר status:"CREATED" עם folderUrl ו-verifiedGdriveLinkOnMonday שאינו null. אם setup_project החזיר SKIP / NO_CLIENT / ALREADY_SET_UP / שגיאה — דווח בדיוק את זה ומה חסר, ואל תתאר תוצאה שלא קרתה.
- "האם זה נוצר?" / ספק כלשהו: קרא ל-read_quote_item ובדוק את gdriveLink בפועל. אם הוא null — הפרויקט לא הוקם; אמור זאת במפורש. צטט את הקישור האמיתי, לא קישור מומצא.
- גם במספרים/השוואות: הצג רק ערכים שחזרו מהכלים. אם אינך בטוח או שחסר לך מידע — אמור שאינך בטוח ושאל, אל תצהיר בביטחון.

כללים:
- ענה בשפת המשתמש (עברית או אנגלית), בקצרה וקונקרטית. בלי פתיחות מנופחות.
- לשאלות ניתוח והשוואה (השוואת הצעות של לקוח, שטחים של פרויקטים, מחיר למ"ר לפי סוג שימוש, סכומים לפי לקוח וכו') השתמש ב-query_quotes ו-aggregate_quotes מעל האינדקס (QuoteRecord). לפריט בודד השתמש ב-get_quote.
- **הצג כל השוואה כטבלת Markdown תקנית (GFM)** עם שורת כותרת ומפרידי | --- | (הממשק מרנדר אותה כטבלה מעוצבת). כלול עמודות רלוונטיות (פרויקט, מחיר, שטח, מחיר למ"ר, סוג שימוש וכו'), הדגש מספרי מפתח ב-**bold**, והוסף עמודה עם קישור למסמך/גיליון כ-[מסמך](URL) כשיש. סכם בשורה קצרה מתחת לטבלה. ציין אם נתון (למשל שטח) חסר לחלק מהפריטים.
- כל פריט כולל שש דמויות קשר מלוח MA-006-Contacts: יזם ראשי (=client/developer), איש קשר מטעם היזם (developerContact), ניהול הפרויקט (projectManagement), איש קשר מטעם מנהל פרויקט (projectManagerContact), מזמין העבודה (workOrderer), איש קשר טעם מזמין העבודה (workOrdererContact). אפשר לסנן ולקבץ לפי כל אחד מהם (למשל "כל ההצעות שבניהול הפרויקט של X", "כמה הצעות לכל מזמין עבודה").
- לשאלות מפורטות ברמת הסעיף (מחיר למ"ר, עלות תאום מערכות בנפרד, שכר טרחה, ניהול מודל, מידול פתחים, אבני דרך ותשלומים, פירוק תמחור) שאינן באינדקס: העדף את read_quote_doc — מסמך ההצעה הסופי שנשלח ללקוח, שממנו מקבלים טבלאות מפורטות ואמינות (שירות/מחיר, מחיר למטר/שטח/מחיר מוצע, לוח אבני דרך). אם לפריט אין מסמך (קיים רק גיליון), השתמש ב-read_quote_sheet (WorkingSheet/ToQuote/Prices). להשוואה בין כמה הצעות קרא לכל אחת בנפרד (מתאים למספר קטן של פריטים; להיקף גדול הצע לצמצם).
- אם המידע נראה לא מעודכן או שמקסים מבקש לרענן, קרא ל-sync_index.
- לאיתור הצעה לפי שם השתמש ב-find_quote, ואמת עם read_quote_item.
- להקמת פרויקט לפי דרישה: פעל דרך ה-tools בלבד (אל תכתוב מיילים או טקסטים חופשיים). קרא ל-setup_project פעם אחת עם ה-itemId (והוסף clientOverride רק אם מקסים ציין לקוח מפורשות). הכלי בעצמו מזהה את הלקוח מהפריט (יזם ראשי, אחרת מזמין העבודה), מאתר/יוצר את תיקיית הלקוח, ויוצר את "<מספר הצעה> - <שם>" ישירות בתוכה. הכלי לעולם לא ימציא לקוח משם הפריט. אם הוא מחזיר SKIP (לא סוג C / אין מספר הצעה) או NO_CLIENT (אין יזם ראשי/מזמין) — הסבר למקסים בדיוק מה להשלים ב-Monday, ואל תנסה לעקוף.
- להצעת היקף: read_received_materials ואז propose_scope. זו הצעה בלבד, לעולם אל תמלא את גיליון ToQuote.
- כשמקסים נותן העדפה או הנחיה קבועה לאופן העבודה (למשל "תמיד תייג גם את X", "לקוח Y נמצא תחת התיקייה Z") קרא ל-save_guidance עם ניסוח תמציתי בשורה אחת, ואשר ששמרת. אל תשמור שאלות חד פעמיות.
`.trim()

/** Build the chat system prompt: persona + capabilities + recent runs + active guidance. */
export async function buildChatSystem(): Promise<string> {
  await connectDB()
  const runs = await AgentRun.find({ agentKey: AGENT_KEY }).sort({ startedAt: -1 }).limit(5).lean()
  const guidance = await getGuidance(AGENT_KEY)

  const recent =
    runs.length === 0
      ? 'אין ריצות אחרונות.'
      : runs
          .map((r) => {
            const when = new Date(r.startedAt).toLocaleString('he-IL', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
            return `- ${r.pass}/${r.trigger} (${r.status}, ${when}): ${(r.summary ?? r.error ?? '').slice(0, 220)}`
          })
          .join('\n')

  return [
    CHAT_BASE,
    '',
    'מה אתה עושה: (1) כשמתווסף ללוח MA-001-Price Quotes פריט מסוג C עם מספר הצעה, אתה מקים אוטומטית את תיקיות הפרויקט, מעתיק את תבנית ההצעה, אוסף את הקבצים שהתקבלו, כותב את הקישורים חזרה ל-Monday, ומציע היקף עבודה ראשוני. (2) אתה מתחזק אינדקס של כל ההצעות (QuoteRecord) עם עמודות ה-Monday (לקוח, מחיר, סוג פרויקט, סוג שימוש, מקום, סטטוס, תאריכים, קישורי Sheet/Doc/תיקייה) ושטח הפרויקט מתוך הגיליון, כדי לענות על שאלות השוואה וניתוח. את בניית טבלאות ההצעה ושליחת ה-PDF/מייל מבצע מקסים דרך התפריטים במסמך (📄 / 📧).',
    '',
    QUOTE_STRUCTURE,
    '',
    `ריצות אחרונות שלך:\n${recent}`,
    guidanceBlock(guidance) || '\n(אין עדיין הנחיות מצטברות)',
  ].join('\n')
}

/** Chat tools: read-only lookups + save_guidance + scoped writes (on-demand setup / scope proposal). */
export function makeChatTools(userId?: string) {
  const saveGuidance = betaZodTool({
    name: 'save_guidance',
    description:
      'Save a durable instruction/preference from Maxim about how Squirrel should work in the future. Concise one-line phrasing. Only for lasting guidance, not one-off questions.',
    inputSchema: z.object({ text: z.string().describe('the guidance, one concise line') }),
    run: async ({ text }) => {
      await addGuidance(AGENT_KEY, text, userId)
      return `saved guidance: "${text}"`
    },
  })

  return [
    readQuoteItem,
    findQuote,
    readReceivedMaterials,
    setupProject,
    proposeScope,
    notifyMaxim,
    saveGuidance,
    ...analyticsTools,
  ]
}
