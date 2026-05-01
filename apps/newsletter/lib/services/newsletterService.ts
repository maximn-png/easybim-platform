import { connectDB } from '@/lib/db/mongoose'
import Newsletter, { INewsletter } from '@/lib/models/Newsletter'
import RssSource from '@/lib/models/RssSource'
import StyleProfile from '@/lib/models/StyleProfile'
import { fetchAllFeeds, RssItem } from './rssService'
import { cohereChat } from './cohereService'
import { geminiChat, geminiGenerateImage } from './geminiService'
import { TOPIC_SELECTION_PROMPT, CONTENT_GENERATION_PROMPT, DEFAULT_STYLE_PROFILE } from '@/lib/constants/prompts'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

export interface GenerationConfig {
  userId: string
  llmProvider: 'cohere' | 'gemini'
  daysBack: number
  topicCount: number
  generateImages: boolean
  writingStyle?: string
  cohereApiKey?: string
  geminiApiKey?: string
  activeSourceIds?: string[]
}

export type SSEEvent =
  | { step: number; message: string; total: number }
  | { done: true; newsletterId: string }
  | { error: string }

function resolveKey(envKey: string | undefined, dbKey: string | undefined): string {
  return dbKey || envKey || ''
}

function formatRssItemsForPrompt(items: RssItem[]): string {
  return items
    .slice(0, 80)
    .map(
      (item, i) =>
        `[${i + 1}] Title: ${item.title}\nSource: ${item.feedName} (${item.category})\nURL: ${item.link}\nSummary: ${item.contentSnippet}\nDate: ${item.pubDate}`
    )
    .join('\n\n---\n\n')
}

function parseJsonSafe<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch { return null }
    }
    return null
  }
}

export function buildNewsletterHtml(topics: INewsletter['topics'], date: Date): string {
  const hebrewDate = format(date, "d 'ב'MMMM yyyy", { locale: he })

  const topicBlocks = topics.map((topic, idx) => {
    const imageBlock = topic.imageBase64
      ? `<img src="data:image/png;base64,${topic.imageBase64}" alt="${topic.title}" style="width:100%;height:220px;object-fit:cover;display:block;border-radius:6px 6px 0 0;" />`
      : `<div style="width:100%;height:200px;background:linear-gradient(135deg,#1e248c,#0a1060);display:flex;align-items:center;justify-content:center;border-radius:6px 6px 0 0;"><span style="color:#44b8d3;font-size:36px;">⚙</span></div>`

    const divider = idx < topics.length - 1
      ? `<div style="height:2px;background:linear-gradient(90deg,#44b8d3,#1e248c);margin:32px 0;"></div>`
      : ''

    return `
    <div style="margin-bottom:8px;">
      ${imageBlock}
      <div style="padding:20px 0 8px;">
        <h2 style="font-size:18px;font-weight:700;color:#1e248c;margin:0 0 12px;line-height:1.4;direction:rtl;text-align:right;">${topic.title}</h2>
        <p style="font-size:15px;color:#0a0a1a;line-height:1.7;margin:0 0 12px;direction:rtl;text-align:right;">${topic.body}</p>
        <a href="${topic.sourceUrl}" style="font-size:12px;color:#44b8d3;text-decoration:none;" target="_blank">${topic.sourceName} ←</a>
      </div>
    </div>
    ${divider}`
  }).join('')

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap" rel="stylesheet"/>
<title>EasyBIM Newsletter</title>
</head>
<body style="margin:0;padding:20px 0;background:#f0f2ff;font-family:'Heebo',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(30,36,140,0.12);">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#1e248c,#0a1060);padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle;">
          <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;">Easy<span style="color:#44b8d3;">BIM</span></div>
          <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;font-weight:400;letter-spacing:0.5px;">Innovative Engineering</div>
        </td>
        <td style="text-align:right;vertical-align:middle;">
          <div style="font-size:12px;color:rgba(255,255,255,0.55);font-weight:400;">${hebrewDate}</div>
          <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:5px;letter-spacing:-0.2px;">BIM Newsletter</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- CONTENT -->
  <div style="padding:32px;">
    ${topicBlocks}
  </div>

  <!-- FOOTER -->
  <div style="background:#f8f9ff;border-top:2px solid #e8eaff;padding:24px 32px;text-align:center;">
    <div style="font-size:13px;font-weight:700;color:#1e248c;margin-bottom:6px;">EasyBIM Innovative Engineering</div>
    <div style="font-size:12px;color:#6b7280;">
      <a href="mailto:office@easybim.co.il" style="color:#44b8d3;text-decoration:none;">office@easybim.co.il</a>
      &nbsp;|&nbsp; 03-6888477 &nbsp;|&nbsp;
      <a href="https://www.easybim.co.il" style="color:#44b8d3;text-decoration:none;">www.easybim.co.il</a>
    </div>
  </div>

</div>
</body>
</html>`
}

export async function generateNewsletter(
  config: GenerationConfig,
  onEvent: (event: SSEEvent) => void
): Promise<string> {
  await connectDB()

  // Resolve API keys: DB record → env fallback
  let cohereKey = ''
  let geminiKey = ''

  // For now keys come from config (passed from DB/env in the route)
  cohereKey = resolveKey(process.env.COHERE_API_KEY, config.cohereApiKey)
  geminiKey = resolveKey(process.env.GEMINI_API_KEY, config.geminiApiKey)

  const llmKey = config.llmProvider === 'cohere' ? cohereKey : geminiKey
  if (!llmKey) throw new Error(`API key missing for ${config.llmProvider}`)

  // Step 1: Fetch RSS
  onEvent({ step: 1, message: 'Fetching articles from sources...', total: 5 })

  const sourcesQuery = RssSource.find({ userId: config.userId, isActive: true })
  if (config.activeSourceIds?.length) {
    sourcesQuery.where('_id').in(config.activeSourceIds)
  }
  const sources = await sourcesQuery.exec()

  if (sources.length === 0) throw new Error('No active RSS sources')

  const rssItems = await fetchAllFeeds(sources, config.daysBack)
  if (rssItems.length === 0) throw new Error('No articles found for the requested period')

  // Step 2: Select topics
  onEvent({ step: 2, message: `Selecting ${config.topicCount} relevant topics from ${rssItems.length} articles...`, total: 5 })

  const itemsText = formatRssItemsForPrompt(rssItems)
  const selectionPrompt = TOPIC_SELECTION_PROMPT(itemsText)

  let selectedTopicsRaw: string
  if (config.llmProvider === 'cohere') {
    selectedTopicsRaw = await cohereChat('You are a BIM content curator.', selectionPrompt, cohereKey)
  } else {
    selectedTopicsRaw = await geminiChat(selectionPrompt, geminiKey)
  }

  type SelectedTopic = { title: string; link: string; summary: string; feedName: string; category: string; imagePromptSuggestion: string }
  const selectedTopics = parseJsonSafe<SelectedTopic[]>(selectedTopicsRaw)
  if (!selectedTopics?.length) throw new Error('Topic selection failed — invalid LLM response')

  const topicsToProcess = selectedTopics.slice(0, config.topicCount)

  // Get style profile
  const styleProfileDoc = await StyleProfile.findOne({ userId: config.userId })
  const styleProfile = styleProfileDoc?.styleNotes || DEFAULT_STYLE_PROFILE

  // Step 3: Generate content per topic
  onEvent({ step: 3, message: 'Writing Hebrew content for each topic...', total: 5 })

  type ContentResult = { hebrewTitle: string; hebrewBody: string }
  const contentResults = await Promise.allSettled(
    topicsToProcess.map(async (topic) => {
      const prompt = CONTENT_GENERATION_PROMPT(
        topic.title, topic.summary, topic.link, topic.category, styleProfile, config.writingStyle
      )
      let raw: string
      if (config.llmProvider === 'cohere') {
        raw = await cohereChat('You are a Hebrew BIM newsletter writer.', prompt, cohereKey)
      } else {
        raw = await geminiChat(prompt, geminiKey)
      }
      return parseJsonSafe<ContentResult>(raw) ?? { hebrewTitle: topic.title, hebrewBody: topic.summary }
    })
  )

  // Step 4: Generate images
  onEvent({ step: 4, message: 'Generating images...', total: 5 })

  const imageResults: (string | null)[] = new Array(topicsToProcess.length).fill(null)

  if (config.generateImages && geminiKey) {
    const imageSettled = await Promise.allSettled(
      topicsToProcess.map((topic) =>
        geminiGenerateImage(
          `${topic.imagePromptSuggestion}. Professional BIM engineering visualization, no people, teal and navy color palette, photorealistic editorial style.`,
          geminiKey
        )
      )
    )
    imageSettled.forEach((result, i) => {
      if (result.status === 'fulfilled') imageResults[i] = result.value
      else console.warn(`[Images] Topic ${i} image generation failed:`, result.reason)
    })
  }

  // Step 5: Assemble newsletter
  onEvent({ step: 5, message: 'Assembling final newsletter...', total: 5 })

  const topics: INewsletter['topics'] = topicsToProcess.map((topic, i) => {
    const result = contentResults[i]
    const content = result.status === 'fulfilled'
      ? result.value
      : { hebrewTitle: topic.title, hebrewBody: topic.summary }

    return {
      title: content?.hebrewTitle ?? topic.title,
      body: content?.hebrewBody ?? topic.summary,
      sourceUrl: topic.link,
      sourceName: topic.feedName,
      imageBase64: imageResults[i] ?? undefined,
      imagePrompt: topic.imagePromptSuggestion,
    }
  })

  const now = new Date()

  const newsletter = await Newsletter.create({
    title: `BIM Newsletter — ${format(now, 'dd/MM/yyyy')}`,
    date: now,
    topics,
    llmProvider: config.llmProvider,
    status: 'ready',
    userId: config.userId,
  })

  return String(newsletter._id)
}
