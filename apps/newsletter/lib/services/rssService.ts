import Parser from 'rss-parser'
import { convert } from 'html-to-text'
import { IRssSource } from '@/lib/models/RssSource'

export interface RssItem {
  title: string
  link: string
  contentSnippet: string
  pubDate: string
  feedName: string
  category: string
}

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'BIMNewsletter/1.0' },
})

function stripHtml(html: string): string {
  return convert(html, { wordwrap: false, selectors: [{ selector: 'a', options: { ignoreHref: true } }, { selector: 'img', format: 'skip' }] })
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 500)
}

async function fetchFeed(source: IRssSource, daysBack: number): Promise<RssItem[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const feed = await parser.parseURL(source.url)
    clearTimeout(timeout)

    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

    return feed.items
      .filter((item) => {
        if (!item.pubDate && !item.isoDate) return true
        const date = new Date(item.pubDate ?? item.isoDate ?? '')
        return isNaN(date.getTime()) || date >= cutoff
      })
      .map((item) => ({
        title: item.title ?? '',
        link: item.link ?? item.guid ?? '',
        contentSnippet: stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? ''),
        pubDate: item.pubDate ?? item.isoDate ?? '',
        feedName: source.name,
        category: source.category,
      }))
      .filter((item) => item.link && item.title)
  } catch {
    clearTimeout(timeout)
    console.warn(`[RSS] Skipped ${source.name} (${source.url}): fetch failed`)
    return []
  }
}

export async function fetchAllFeeds(sources: IRssSource[], daysBack = 7): Promise<RssItem[]> {
  const activeSources = sources.filter((s) => s.isActive)

  const results = await Promise.allSettled(
    activeSources.map((source) => fetchFeed(source, daysBack))
  )

  const allItems: RssItem[] = []
  const seen = new Set<string>()

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        if (item.link && !seen.has(item.link)) {
          seen.add(item.link)
          allItems.push(item)
        }
      }
    }
  }

  return allItems.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime() || 0
    const dateB = new Date(b.pubDate).getTime() || 0
    return dateB - dateA
  })
}
