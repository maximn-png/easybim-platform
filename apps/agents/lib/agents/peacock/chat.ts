import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import { runAgent } from '@/lib/core/agentRuntime'
import { BRAND_VOICE, CADENCE } from './brand'
import { addGuidance, getGuidance, guidanceBlock } from './guidance'
import { AUTHOR_SYSTEM, buildDateContext } from './prompts'
import { peacockTools, getBacklog, readItem } from './tools'

export const AGENT_KEY = 'peacock'

/**
 * Draft a SPECIFIC item into a post on demand (off the weekly schedule), as a
 * focused manual author pass. Writes only up to Pending Approval — never
 * publishes. Creates its own AgentRun (trigger 'manual'), so it shows in the
 * dashboard run history.
 */
export async function draftItemOnDemand(itemId: string, note: string | undefined, userId?: string) {
  const guidance = await getGuidance(AGENT_KEY)
  const dateContext = buildDateContext(new Date())
  const userMessage = [
    `מקסים ביקש לפתח Item ספציפי לפוסט עכשיו, מחוץ למחזור השבועי.`,
    `מזהה ה-Item: ${itemId}.`,
    note ? `הערת מקסים: ${note}` : '',
    dateContext,
    `קרא את ה-Item (read_item), כתוב טיוטה מלאה on-brand, קבע PostType ו-Publish Date (הסלוט הקרוב הפנוי, שני או חמישי), פרסם את הטיוטה ל-Updates עם תיוג מקסים, וקבע Status="Pending Approval". אל תפרסם ואל תעבור מעבר ל-Pending Approval. החזר שורת סיכום קצרה.`,
  ]
    .filter(Boolean)
    .join('\n')

  return runAgent({
    agentKey: AGENT_KEY,
    pass: 'author',
    trigger: 'manual',
    system: AUTHOR_SYSTEM + guidanceBlock(guidance),
    tools: peacockTools,
    userMessage,
    context: { itemId, onDemand: true, requestedBy: userId },
  })
}

const CHAT_BASE = `
אתה 🦚 Peacock, סוכן השיווק של EasyBIM ללינקדאין, בשיחה עם מקסים (המפעיל שלך).
תפקידך כאן: לעזור למקסים להבין מה אתה עושה, להסביר ריצות אחרונות, לענות על שאלות על הפוסטים ועל אופן העבודה, ולקבל ממנו הנחיות לשיפור.

כללים:
- ענה בשפת המשתמש (עברית או אנגלית), בקצרה וקונקרטית. בלי פתיחות מנופחות.
- אינך מפרסם, אינך מקדם סטטוס מעבר ל-Pending Approval, ואינך עורך פריטים קיימים אחרים. אם מבקשים אישור/פרסום, הסבר שזה נעשה דרך תהליך האישור בלוח.
- פעולת הכתיבה היחידה המותרת לך: כשמקסים מבקש לפתח Item ספציפי לפוסט עכשיו (מחוץ למחזור השבועי), השתמש ב-draft_item_now כדי לפתח אותו לטיוטה ולהעביר ל-Pending Approval. אם מקסים מתאר Item לפי שם ("הוספתי רעיון על X"), מצא אותו עם get_backlog, אמת עם read_item, ואז draft_item_now. אם לא מצאת, בקש את מזהה ה-Item.
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

/**
 * Chat tools: read-only board lookups + save_guidance + one scoped write
 * (draft_item_now → Pending Approval). No publish/approve/edit of other items.
 */
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

  const draftItemNow = betaZodTool({
    name: 'draft_item_now',
    description:
      'Draft a SPECIFIC Monday item into a post right now, off the weekly schedule, when Maxim asks. Drafts to Pending Approval only — never publishes. Needs the item id (use get_backlog/read_item first to find it by name).',
    inputSchema: z.object({
      itemId: z.string(),
      note: z.string().optional().describe("any angle/instruction Maxim gave for this post"),
    }),
    run: async ({ itemId, note }) => {
      const { summary } = await draftItemOnDemand(itemId, note, userId)
      return `drafted item ${itemId} → Pending Approval. ${summary.slice(0, 400)}`
    },
  })

  // get_backlog + read_item are read-only — safe for the advisor to locate items.
  return [getBacklog, readItem, saveGuidance, draftItemNow]
}
