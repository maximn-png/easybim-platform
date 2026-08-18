// Peacock tools over the BIM newsletter — the idea source for "1. Professional"
// posts. Gives the agent real industry topics with citable sources instead of
// inventing a subject or asking Maxim to supply one.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { listIssues, listRecentTopics, readTopic } from './newsletter'

export const listNewsletterTopicsTool = betaZodTool({
  name: 'list_newsletter_topics',
  description:
    'List recent topics from the EasyBIM BIM newsletter (generated weekly from 21 RSS sources). Each topic has a title, a short body and the original source. This is the primary idea source for "1. Professional" thought-leadership posts — check here before asking Maxim for a subject. Returns newsletterId + index, which read_newsletter_topic takes.',
  inputSchema: z.object({
    issues: z.number().min(1).max(12).optional().describe('how many recent issues to pull topics from (default 4)'),
  }),
  run: async ({ issues }) => {
    const topics = await listRecentTopics({ issues: issues ?? 4, bodyChars: 260 })
    if (topics.length === 0) return 'No newsletter topics found.'
    return JSON.stringify(
      topics.map((t) => ({
        newsletterId: t.newsletterId,
        index: t.index,
        date: t.date.slice(0, 10),
        title: t.title,
        body: t.body,
        source: t.sourceName,
        sourceUrl: t.sourceUrl,
      }))
    )
  },
})

export const readNewsletterTopicTool = betaZodTool({
  name: 'read_newsletter_topic',
  description:
    'Read one newsletter topic in full (untruncated body + source URL), addressed by newsletterId and index from list_newsletter_topics. Use before writing a post based on it.',
  inputSchema: z.object({
    newsletterId: z.string(),
    index: z.number().min(0),
  }),
  run: async ({ newsletterId, index }) => {
    const topic = await readTopic(newsletterId, index)
    return topic ? JSON.stringify(topic) : 'NOT_FOUND'
  },
})

export const listNewsletterIssuesTool = betaZodTool({
  name: 'list_newsletter_issues',
  description: 'List recent newsletter issues (date, title, how many topics each). Use to orient before pulling topics.',
  inputSchema: z.object({}),
  run: async () => {
    const issues = await listIssues(12)
    return JSON.stringify(issues.map((i) => ({ id: i.id, date: i.date.slice(0, 10), title: i.title, topics: i.topicCount })))
  },
})

export const newsletterTools = [listNewsletterTopicsTool, readNewsletterTopicTool, listNewsletterIssuesTool]
