import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import * as board from './board'

// Each tool returns a string (the tool result the model reads back).

export const getBacklog = betaZodTool({
  name: 'get_backlog',
  description:
    'List the active LinkedIn post backlog (items in Idea or Drafting). Prefer developing these over creating new items.',
  inputSchema: z.object({}),
  run: async () => {
    const items = await board.getActiveBacklog()
    const rows = items.map((it) => ({
      id: it.id,
      name: it.name,
      postType: it.column_values.find((c) => c.id === board.COL.postType)?.text ?? null,
      status: it.column_values.find((c) => c.id === board.COL.status)?.text ?? null,
      publishDate: it.column_values.find((c) => c.id === board.COL.publishDate)?.text ?? null,
    }))
    return JSON.stringify(rows)
  },
})

export const readItem = betaZodTool({
  name: 'read_item',
  description: 'Read one Monday post item (name + columns) by id, to use its content as the seed for a draft.',
  inputSchema: z.object({ itemId: z.string() }),
  run: async ({ itemId }) => {
    const it = await board.readItem(itemId)
    return it ? JSON.stringify(it) : 'NOT_FOUND'
  },
})

export const createPost = betaZodTool({
  name: 'create_post',
  description:
    'Create a new post item in the Posts group with a name, PostType label, and publish date (YYYY-MM-DD, a Monday or Thursday). Returns the new item id. Use only when no suitable backlog item exists.',
  inputSchema: z.object({
    name: z.string(),
    postType: z.enum(board.POST_TYPES),
    publishDate: z.string().describe('YYYY-MM-DD, a Monday or Thursday'),
  }),
  run: async ({ name, postType, publishDate }) => {
    const id = await board.createPostItem(name, postType, publishDate)
    return `created item ${id}`
  },
})

export const setPublishDate = betaZodTool({
  name: 'set_publish_date',
  description: 'Set/correct a post item Publish Date (YYYY-MM-DD). Always verify by reading the item back.',
  inputSchema: z.object({ itemId: z.string(), publishDate: z.string() }),
  run: async ({ itemId, publishDate }) => {
    await board.setPublishDate(itemId, publishDate)
    const it = await board.readItem(itemId)
    const got = it?.column_values.find((c) => c.id === board.COL.publishDate)?.text ?? null
    return `publish date set; readback="${got}"`
  },
})

export const setPostType = betaZodTool({
  name: 'set_post_type',
  description: 'Set a post item PostType.',
  inputSchema: z.object({ itemId: z.string(), postType: z.enum(board.POST_TYPES) }),
  run: async ({ itemId, postType }) => {
    await board.setPostType(itemId, postType)
    return 'ok'
  },
})

export const setStatus = betaZodTool({
  name: 'set_status',
  description:
    'Set a post item Status. Allowed: Idea, Drafting, Pending Approval, Approved, Ready to Publish, Scheduled, Published. Never advance past Pending Approval without an explicit approval reply.',
  inputSchema: z.object({
    itemId: z.string(),
    status: z.enum([
      'Idea',
      'Drafting',
      'Pending Approval',
      'Approved',
      'Ready to Publish',
      'Scheduled',
      'Published',
    ]),
  }),
  run: async ({ itemId, status }) => {
    await board.setStatus(itemId, status)
    return 'ok'
  },
})

export const postDraft = betaZodTool({
  name: 'post_draft',
  description:
    'Post a draft (HTML body, RTL) to a post item Updates feed and notify Maxim. Use a clean RTL <div dir="rtl"> with brand colors for hashtags (#1e248c). Provide a short notify text for the bell.',
  inputSchema: z.object({
    itemId: z.string(),
    bodyHtml: z.string(),
    notifyText: z.string(),
  }),
  run: async ({ itemId, bodyHtml, notifyText }) => {
    await board.postDraftAndTag(itemId, bodyHtml, notifyText)
    return 'posted + notified'
  },
})

export const readUpdates = betaZodTool({
  name: 'read_updates',
  description: 'Read recent Updates on a post item to classify Maxim reply (approval vs edit request).',
  inputSchema: z.object({ itemId: z.string(), limit: z.number().optional() }),
  run: async ({ itemId, limit }) => {
    const ups = await board.readUpdates(itemId, limit ?? 25)
    return JSON.stringify(
      ups.map((u) => ({
        id: u.id,
        text: u.text_body,
        by: u.creator_id,
        at: u.created_at,
        replies: u.replies.map((r) => ({ text: r.text_body, by: r.creator_id, at: r.created_at })),
      }))
    )
  },
})

export const setDriveLink = betaZodTool({
  name: 'set_drive_link',
  description: 'Set the Drive Link column to the package folder URL once a post package is assembled.',
  inputSchema: z.object({ itemId: z.string(), url: z.string(), text: z.string().optional() }),
  run: async ({ itemId, url, text }) => {
    await board.setDriveLink(itemId, url, text ?? 'Package')
    return 'ok'
  },
})

export const peacockTools = [
  getBacklog,
  readItem,
  createPost,
  setPublishDate,
  setPostType,
  setStatus,
  postDraft,
  readUpdates,
  setDriveLink,
]
