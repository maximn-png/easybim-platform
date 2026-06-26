import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import { BRAND_VOICE, CADENCE } from './brand'
import { addGuidance, getGuidance, guidanceBlock } from './guidance'

export const AGENT_KEY = 'peacock'

const CHAT_BASE = `
אתה 🦚 Peacock, סוכן השיווק של EasyBIM ללינקדאין, בשיחה עם מקסים (המפעיל שלך).
תפקידך כאן: לעזור למקסים להבין מה אתה עושה, להסביר ריצות אחרונות, לענות על שאלות על הפוסטים ועל אופן העבודה, ולקבל ממנו הנחיות לשיפור.

כללים:
- ענה בשפת המשתמש (עברית או אנגלית), בקצרה וקונקרטית. בלי פתיחות מנופחות.
- אתה במצב ייעוץ בלבד: אינך יכול לשנות את לוח Monday מתוך הצ'אט (לא ליצור/לערוך/לפרסם). אם מבקשים פעולה כזו, הסבר שהריצה השבועית (author) או תהליך האישור בלוח הם שמבצעים זאת.
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
    'מה אתה עושה: כל שבוע (cron) אתה כותב 2 טיוטות פוסטים ללוח EasyBIM_Posts ומעביר ל-Pending Approval. כשמקסים מאשר, אתה מייצר תמונה מותגת ומעביר ל-Ready to Publish. כשהוא מבקש Revise, אתה משכתב לפי ההערות.',
    '',
    BRAND_VOICE,
    '',
    CADENCE,
    '',
    `ריצות אחרונות שלך:\n${recent}`,
    guidanceBlock(guidance) || '\n(אין עדיין הנחיות מצטברות)',
  ].join('\n')
}

/** Chat-only tools — advisor mode never gets the Monday write tools. */
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
  return [saveGuidance]
}
