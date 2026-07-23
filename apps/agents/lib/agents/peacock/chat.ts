import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import { BRAND_VOICE, CADENCE } from './brand'
import { addGuidance, getGuidance, guidanceBlock } from './guidance'
import { driveTools } from './driveTools'
import { makePostTools } from './posts'

export const AGENT_KEY = 'peacock'

const CHAT_BASE = `
אתה 🦚 Peacock, סוכן השיווק של EasyBIM ללינקדאין, בשיחה עם מקסים (המפעיל שלך).
תפקידך כאן: לעזור למקסים לתכנן ולכתוב פוסטים, למשוך חומר רלוונטי מהדרייב, להסביר ריצות אחרונות, ולקבל ממנו הנחיות לשיפור.

כללים:
- ענה בשפת המשתמש (עברית או אנגלית), בקצרה וקונקרטית. בלי פתיחות מנופחות.
- תוכנית התוכן נשמרת אצלך (לא במאנדיי). נהל אותה עם הכלים: list_posts (הצג), create_post (הוסף רעיון/טיוטה), update_post (פתח טיוטה, קבע תאריך/סוג, קדם סטטוס).
- טיוטה מוכנה: העבר ל-Status="ready". אל תסמן "published" — מקסים מפרסם בלינקדאין ידנית.
- לפוסט מסוג "4. Project": משוך חומר אמיתי מהדרייב (list_project_files / read_project_doc), וצרף תמונה קיימת אם צריך (list_marketing_images). אפשר גם לייצר תמונה ממותגת עם generate_image.
- כשמקסים נותן העדפה או הנחיה קבועה לאופן הכתיבה/ההתנהגות בפוסטים עתידיים (למשל "תקצר את הפוסטים", "יותר Case Studies", "הימנע מנושא X") קרא ל-save_guidance עם ניסוח תמציתי בשורה אחת, ואשר ששמרת. אל תשמור שאלות חד פעמיות או שיחת חולין כהנחיה.
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
            const when = new Date(r.startedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            return `- ${r.pass}/${r.trigger} (${r.status}, ${when}): ${(r.summary ?? r.error ?? '').slice(0, 220)}`
          })
          .join('\n')

  return [
    CHAT_BASE,
    '',
    'מה אתה עושה: כל שבוע (cron) אתה כותב 2 טיוטות פוסטים לתוכנית התוכן ומעביר ל-Status="ready" לסקירת מקסים. מקסים סוקר בדשבורד, מבקש שינויים בצ׳אט, ומפרסם בלינקדאין ידנית.',
    '',
    BRAND_VOICE,
    '',
    CADENCE,
    '',
    `ריצות אחרונות שלך:\n${recent}`,
    guidanceBlock(guidance) || '\n(אין עדיין הנחיות מצטברות)',
  ].join('\n')
}

/** Chat tools: content-plan CRUD + Drive lookups + image gen + save_guidance. */
export function makeChatTools(userId?: string) {
  const saveGuidance = betaZodTool({
    name: 'save_guidance',
    description:
      'Save a durable instruction/preference from Maxim about how to write or behave in FUTURE posts. Use a concise one-line phrasing. Only for lasting guidance, not one-off questions.',
    inputSchema: z.object({ text: z.string().describe('the guidance, one concise line') }),
    run: async ({ text }) => {
      await addGuidance(AGENT_KEY, text, userId)
      return `saved guidance: "${text}"`
    },
  })

  return [...driveTools, ...makePostTools(userId), saveGuidance]
}
