// Per-post chat: the thread pinned to one draft, replacing the Monday item's
// Updates column. Everything here is bound to a single postId, so Maxim can say
// "תקצר את זה" without naming the post and Peacock edits the right draft.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { POST_STATUSES, POST_STATUS_LABELS, POST_TYPES, PostStatus } from '@/lib/models/PeacockPost'
import { BRAND_VOICE, POSTTYPE_PLAYBOOK } from './brand'
import { addGuidance, getGuidance, guidanceBlock } from './guidance'
import { driveTools } from './driveTools'
import { newsletterTools } from './newsletterTools'
import { generateImageForPost, getPost, listPosts, PostDTO, updatePost } from './posts'

export const AGENT_KEY = 'peacock'

const POST_CHAT_BASE = `
אתה 🦚 Peacock, סוכן השיווק של EasyBIM ללינקדאין, יושב עם מקסים על טיוטה אחת ספציפית.
כל השיחה הזאת עוסקת בפוסט שמוצג לידך במסך. מקסים רואה את הטיוטה בזמן אמת, ולכן:

- כשמקסים מבקש שינוי בטיוטה (לקצר, לחדד hook, להחליף דוגמה, לשנות סיום) — בצע אותו מיד עם update_draft, ואז ענה במשפט אחד מה שינית. אל תשאל "לשלוח לך גרסה?" ואל תדביק את כל הפוסט בצ׳אט: הטיוטה מתעדכנת במסך.
- אם אין עדיין גוף לפוסט, כתוב טיוטה מלאה on-brand עם update_draft כבר בתשובה הראשונה.
- הגוף הוא HTML נקי ב-RTL: עטוף ב-<div dir="rtl">, פסקאות ב-<p>, האשטאגים בסוף בצבע #1e248c.
- לפוסט מסוג "4. Project": משוך חומר אמיתי מהדרייב (list_project_files / read_project_doc) לפני שאתה כותב. אל תמציא נתוני פרויקט.
- סטטוסים: טיוטה שסיימת → "pending_approval" (ממתין לאישור מקסים). מקסים מאשר → "approved". ביקש שינויים → "revise". לעולם אל תסמן "published" — מקסים מפרסם בלינקדאין ידנית ומסמן בעצמו.
- ענה בשפת המשתמש, קצר וקונקרטי. בלי פתיחות מנופחות ובלי לחזור על מה שמקסים אמר.
- כשמקסים נותן העדפה קבועה שתקפה גם לפוסטים עתידיים ("תמיד תקצר", "פחות אמוג'ים") — שמור אותה עם save_guidance בנוסף לתיקון הטיוטה עצמה.
`.trim()

/** A compact snapshot of the post, so Peacock opens the thread already in context. */
export function postContextBlock(post: PostDTO): string {
  const date = (iso: string | null) => (iso ? iso.slice(0, 10) : 'לא נקבע')
  const body = post.body?.trim()
  return [
    '--- הפוסט שאתה עובד עליו כרגע ---',
    `id: ${post.id}`,
    `כותרת: ${post.title}`,
    `PostType: ${post.postType ?? 'לא נקבע'}`,
    `Status: ${POST_STATUS_LABELS[post.status]} (${post.status})`,
    `Publish Date: ${date(post.publishDate)} · תחילת עבודה: ${date(post.draftStartDate)}`,
    post.projectNumber ? `מספר פרויקט: ${post.projectNumber}` : null,
    post.notes ? `הערות: ${post.notes}` : null,
    post.imageUrl ? `תמונה מקושרת: ${post.imageUrl}` : 'אין תמונה מקושרת.',
    '',
    body ? `הטיוטה הנוכחית:\n${body}` : 'אין עדיין טיוטה — הגוף ריק.',
    '--- סוף הפוסט ---',
  ]
    .filter(Boolean)
    .join('\n')
}

/** System prompt for a post thread: persona + brand + this post's live state + guidance. */
export async function buildPostChatSystem(post: PostDTO): Promise<string> {
  const guidance = await getGuidance(AGENT_KEY)
  return [
    POST_CHAT_BASE,
    '',
    BRAND_VOICE,
    '',
    POSTTYPE_PLAYBOOK,
    '',
    postContextBlock(post),
    guidanceBlock(guidance),
  ].join('\n')
}

/** Tools bound to one post — no id argument to get wrong. */
export function makePostChatTools(postId: string, userId?: string) {
  const updateDraft = betaZodTool({
    name: 'update_draft',
    description:
      `Write or edit THIS post. Pass only the fields you are changing. body = clean RTL HTML (<div dir="rtl">). status is one of ${POST_STATUSES.join('/')} — a finished draft goes to "pending_approval"; never set "published".`,
    inputSchema: z.object({
      body: z.string().optional().describe('the full new draft body, RTL HTML'),
      title: z.string().optional(),
      postType: z.enum(POST_TYPES).optional(),
      status: z.enum(POST_STATUSES as [PostStatus, ...PostStatus[]]).optional(),
      publishDate: z.string().nullable().optional().describe('YYYY-MM-DD'),
      projectNumber: z.string().optional(),
      notes: z.string().optional(),
    }),
    run: async (patch) => {
      const post = await updatePost(postId, patch)
      if (!post) return 'NOT_FOUND'
      const changed = Object.keys(patch).join(', ')
      return `updated this post (${changed}) → status ${post.status}`
    },
  })

  const readDraft = betaZodTool({
    name: 'read_draft',
    description:
      'Re-read THIS post from the store. Use only if you suspect Maxim edited the draft in the editor while you were working.',
    inputSchema: z.object({}),
    run: async () => {
      const post = await getPost(postId)
      return post ? postContextBlock(post) : 'NOT_FOUND'
    },
  })

  const generateImage = betaZodTool({
    name: 'generate_image',
    description:
      'Generate an on-brand EasyBIM cover image for THIS post, store it in the Marketing drive, and link it. Use once the draft body is settled.',
    inputSchema: z.object({}),
    run: async () => {
      const res = await generateImageForPost(postId)
      return res ? `generated + linked cover image: ${res.imageUrl}` : 'NOT_FOUND'
    },
  })

  const listPlan = betaZodTool({
    name: 'list_posts',
    description:
      'List the other posts in the plan as compact rows. Use to avoid repeating a topic or to see what else is scheduled that week. Pass publishedArchive: true to look through what EasyBIM already published.',
    inputSchema: z.object({
      publishedArchive: z.boolean().optional().describe('browse published posts instead of the active plan'),
    }),
    run: async ({ publishedArchive }) => {
      const posts = await listPosts(
        publishedArchive ? { status: 'published', slim: true } : { excludePublished: true, slim: true }
      )
      return JSON.stringify(
        posts
          .filter((p) => p.id !== postId)
          .map((p) => ({ id: p.id, title: p.title, status: p.status, publishDate: p.publishDate?.slice(0, 10) ?? null, postType: p.postType }))
      )
    },
  })

  const saveGuidance = betaZodTool({
    name: 'save_guidance',
    description:
      'Save a durable instruction from Maxim that should apply to FUTURE posts too (not just this one). One concise line.',
    inputSchema: z.object({ text: z.string().describe('the guidance, one concise line') }),
    run: async ({ text }) => {
      await addGuidance(AGENT_KEY, text, userId)
      return `saved guidance: "${text}"`
    },
  })

  return [updateDraft, readDraft, generateImage, listPlan, ...driveTools, ...newsletterTools, saveGuidance]
}
