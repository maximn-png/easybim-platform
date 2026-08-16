// Local post store (replaces Monday) + chat/author tools to plan and draft posts.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import PeacockPost, {
  DRAFT_WINDOW_DAYS,
  IPeacockPost,
  POST_STATUSES,
  POST_TYPES,
  PostMetrics,
  PostStatus,
} from '@/lib/models/PeacockPost'
import { postCommentCounts } from '@/lib/core/conversations'
import { generatePostImage } from './image'
import { getSharedDriveId, findChildFolder, createFolder, uploadBytes } from '@/lib/integrations/google/client'

export const AGENT_KEY = 'peacock'

const GENERATED_IMAGES_FOLDER = 'Peacock-Generated'

/** Generate an on-brand cover for a post, store it in the Marketing drive, and link it on the post. */
export async function generateImageForPost(postId: string): Promise<{ imageUrl: string } | null> {
  await connectDB()
  const post = await PeacockPost.findById(postId)
  if (!post) return null
  const { base64, mimeType } = await generatePostImage(post.body || post.title, post.postType || '1. Professional')
  const bytes = Buffer.from(base64, 'base64')

  const driveId = await getSharedDriveId('Marketing')
  const folderId =
    (await findChildFolder(driveId, GENERATED_IMAGES_FOLDER, driveId)) ??
    (await createFolder(GENERATED_IMAGES_FOLDER, driveId))
  const ext = mimeType.includes('jpeg') ? 'jpg' : 'png'
  const fileId = await uploadBytes(folderId, `post-${postId}.${ext}`, bytes, mimeType)
  const imageUrl = `https://drive.google.com/file/d/${fileId}/view`

  post.imageUrl = imageUrl
  await post.save()
  return { imageUrl }
}

export interface PostDTO {
  id: string
  title: string
  body: string | null
  postType: string | null
  status: PostStatus
  publishDate: string | null
  draftStartDate: string | null
  imageUrl: string | null
  driveLink: string | null
  linkedinUrl: string | null
  projectNumber: string | null
  notes: string | null
  sourceUrl: string | null
  sourceName: string | null
  metrics: PostMetrics | null
  ownerUserId: string | null
  ownerName: string | null
  ownerImageUrl: string | null
  commentCount: number
  createdAt: string
  updatedAt: string
}

export function serializePost(p: IPeacockPost | Record<string, unknown>, commentCount = 0): PostDTO {
  const d = p as IPeacockPost & { _id: unknown }
  return {
    id: String(d._id),
    title: d.title,
    body: d.body ?? null,
    postType: d.postType ?? null,
    status: (d.status as PostStatus) ?? 'idea',
    publishDate: d.publishDate ? new Date(d.publishDate).toISOString() : null,
    draftStartDate: d.draftStartDate ? new Date(d.draftStartDate).toISOString() : null,
    imageUrl: d.imageUrl ?? null,
    driveLink: d.driveLink ?? null,
    linkedinUrl: d.linkedinUrl ?? null,
    projectNumber: d.projectNumber ?? null,
    notes: d.notes ?? null,
    sourceUrl: d.sourceUrl ?? null,
    sourceName: d.sourceName ?? null,
    metrics: d.metrics ?? null,
    ownerUserId: d.ownerUserId ?? null,
    ownerName: d.ownerName ?? null,
    ownerImageUrl: d.ownerImageUrl ?? null,
    commentCount,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : '',
  }
}

export interface ListPostsFilter {
  status?: PostStatus
  /** Leave out the published archive (154 rows came over from the board). */
  excludePublished?: boolean
  /** Drop the draft bodies — the board list doesn't need them. */
  slim?: boolean
  limit?: number
}

export async function listPosts(filter: ListPostsFilter = {}): Promise<PostDTO[]> {
  await connectDB()
  const q: Record<string, unknown> = {}
  if (filter.status) q.status = filter.status
  else if (filter.excludePublished) q.status = { $ne: 'published' }

  const query = PeacockPost.find(q).sort({ publishDate: 1, createdAt: -1 }).limit(filter.limit ?? 400)
  if (filter.slim) query.select('-body -notes')

  const [docs, counts] = await Promise.all([query.lean(), postCommentCounts(AGENT_KEY)])
  return docs.map((d) => serializePost(d as unknown as IPeacockPost, counts[String(d._id)] ?? 0))
}

export async function getPost(id: string): Promise<PostDTO | null> {
  await connectDB()
  const doc = await PeacockPost.findById(id).lean()
  return doc ? serializePost(doc as unknown as IPeacockPost) : null
}

export type PipelineCounts = Record<PostStatus, number> & { total: number }

/** Counts per status — backs the dashboard Content Pipeline donut + stat cards. */
export async function pipelineCounts(): Promise<PipelineCounts> {
  await connectDB()
  const rows = await PeacockPost.aggregate<{ _id: PostStatus; n: number }>([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ])
  const out = Object.fromEntries(POST_STATUSES.map((s) => [s, 0])) as PipelineCounts
  out.total = 0
  for (const r of rows) {
    if (r._id in out) out[r._id] = r.n
    out.total += r.n
  }
  return out
}

/**
 * The drafting window that precedes a publish date. No longer drawn — the
 * timeline plots each post as a single milestone on its publish day — but still
 * maintained so the cron and the chat tools have a consistent "start working on
 * this" date, and so a drag-reschedule shifts it with the publish date.
 */
export function defaultDraftStart(publishDate: Date): Date {
  const d = new Date(publishDate)
  d.setDate(d.getDate() - DRAFT_WINDOW_DAYS)
  return d
}

export interface CreatePostInput {
  title: string
  body?: string
  postType?: string
  status?: PostStatus
  publishDate?: string
  draftStartDate?: string
  projectNumber?: string
  notes?: string
  sourceUrl?: string
  sourceName?: string
  ownerUserId?: string
  ownerName?: string
  ownerImageUrl?: string
  createdBy?: string
}

export async function createPost(input: CreatePostInput): Promise<PostDTO> {
  await connectDB()
  const publishDate = input.publishDate ? new Date(input.publishDate) : undefined
  const doc = await PeacockPost.create({
    title: input.title,
    body: input.body,
    postType: input.postType,
    status: input.status ?? 'idea',
    publishDate,
    // A dated post always gets a drafting window so it shows as a bar on the
    // timeline rather than a zero-width marker.
    draftStartDate: input.draftStartDate
      ? new Date(input.draftStartDate)
      : publishDate
        ? defaultDraftStart(publishDate)
        : undefined,
    projectNumber: input.projectNumber,
    notes: input.notes,
    sourceUrl: input.sourceUrl,
    sourceName: input.sourceName,
    ownerUserId: input.ownerUserId,
    ownerName: input.ownerName,
    ownerImageUrl: input.ownerImageUrl,
    createdBy: input.createdBy,
  })
  return serializePost(doc)
}

export type UpdatePostInput = Partial<
  Pick<
    IPeacockPost,
    | 'title'
    | 'body'
    | 'postType'
    | 'status'
    | 'imageUrl'
    | 'driveLink'
    | 'linkedinUrl'
    | 'projectNumber'
    | 'notes'
    | 'sourceUrl'
    | 'sourceName'
    | 'metrics'
    | 'ownerUserId'
    | 'ownerName'
    | 'ownerImageUrl'
  >
> & { publishDate?: string | null; draftStartDate?: string | null }

export async function updatePost(id: string, patch: UpdatePostInput): Promise<PostDTO | null> {
  await connectDB()
  const set: Record<string, unknown> = { ...patch }

  if ('publishDate' in patch) {
    const publishDate = patch.publishDate ? new Date(patch.publishDate) : null
    set.publishDate = publishDate
    // Keep the window attached to the date unless this same patch sets it
    // explicitly (a drag of the bar's left edge does).
    if (!('draftStartDate' in patch)) {
      set.draftStartDate = publishDate ? defaultDraftStart(publishDate) : null
    }
  }
  if ('draftStartDate' in patch) {
    set.draftStartDate = patch.draftStartDate ? new Date(patch.draftStartDate) : null
  }

  const doc = await PeacockPost.findByIdAndUpdate(id, { $set: set }, { new: true }).lean()
  return doc ? serializePost(doc as unknown as IPeacockPost) : null
}

/**
 * Move a post's whole bar by a day delta (Gantt drag), preserving the window
 * length the user may have resized to.
 */
export async function shiftPostDates(id: string, days: number): Promise<PostDTO | null> {
  await connectDB()
  const post = await PeacockPost.findById(id)
  if (!post) return null
  const shift = (d?: Date) => {
    if (!d) return undefined
    const n = new Date(d)
    n.setDate(n.getDate() + days)
    return n
  }
  post.publishDate = shift(post.publishDate)
  post.draftStartDate = shift(post.draftStartDate)
  await post.save()
  return serializePost(post)
}

export async function deletePost(id: string): Promise<boolean> {
  await connectDB()
  const res = await PeacockPost.findByIdAndDelete(id).lean()
  return !!res
}

// ---- chat/author tools -----------------------------------------------------

export function makePostTools(userId?: string) {
  // Compact rows only: the store also holds ~150 published posts imported from the
  // retired board, so returning full bodies here would swamp the context.
  const listPostsTool = betaZodTool({
    name: 'list_posts',
    description:
      'List posts in the content plan as compact rows (id, title, status, date, type). By default the published archive is left out — pass status="published" to browse what EasyBIM already posted (useful to avoid repeating a topic). Use read_post for one post\'s full draft. Prefer developing existing posts over creating new ones.',
    inputSchema: z.object({
      status: z.enum(POST_STATUSES as [PostStatus, ...PostStatus[]]).optional(),
      titleContains: z.string().optional().describe('case-insensitive substring filter on the title'),
    }),
    run: async ({ status, titleContains }) => {
      const posts = await listPosts({ status, excludePublished: !status, slim: true })
      const needle = titleContains?.toLowerCase()
      const rows = (needle ? posts.filter((p) => p.title.toLowerCase().includes(needle)) : posts).map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        publishDate: p.publishDate?.slice(0, 10) ?? null,
        postType: p.postType,
        owner: p.ownerName,
      }))
      return JSON.stringify({ count: rows.length, posts: rows })
    },
  })

  const readPostTool = betaZodTool({
    name: 'read_post',
    description:
      'Read one post in full by id, including its draft body. Use after list_posts to open a specific draft, or to study a published post as a style reference.',
    inputSchema: z.object({ id: z.string() }),
    run: async ({ id }) => {
      const post = await getPost(id)
      return post ? JSON.stringify(post) : 'NOT_FOUND'
    },
  })

  const createPostTool = betaZodTool({
    name: 'create_post',
    description:
      'Add a post to the content plan. Provide a title; optionally a PostType, a draft body (RTL HTML), a publish date (YYYY-MM-DD), and a project number for case-study posts. New posts default to status "idea". A publish date automatically gets a drafting window on the timeline. When the idea came from a newsletter topic, pass sourceUrl + sourceName so the same topic is not used twice.',
    inputSchema: z.object({
      title: z.string(),
      postType: z.enum(POST_TYPES).optional(),
      body: z.string().optional(),
      publishDate: z.string().optional().describe('YYYY-MM-DD'),
      status: z.enum(POST_STATUSES as [PostStatus, ...PostStatus[]]).optional(),
      projectNumber: z.string().optional(),
      sourceUrl: z.string().optional().describe('source URL of the newsletter topic this post is based on'),
      sourceName: z.string().optional().describe('source name, e.g. "Autodesk Dev Blog"'),
    }),
    run: async (args) => {
      const post = await createPost({ ...args, createdBy: userId })
      return `created post ${post.id} (${post.status})`
    },
  })

  const updatePostTool = betaZodTool({
    name: 'update_post',
    description:
      `Update a post in the content plan by id: set body (RTL HTML draft), postType, status (${POST_STATUSES.join('/')}), publishDate (YYYY-MM-DD or null), draftStartDate, notes, or linkedinUrl. Use to develop a draft or move it through the plan. A finished draft goes to "pending_approval" for Maxim's review — never to "published".`,
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      postType: z.enum(POST_TYPES).optional(),
      status: z.enum(POST_STATUSES as [PostStatus, ...PostStatus[]]).optional(),
      publishDate: z.string().nullable().optional().describe('YYYY-MM-DD'),
      draftStartDate: z.string().nullable().optional().describe('YYYY-MM-DD — start of the drafting window'),
      notes: z.string().optional(),
      linkedinUrl: z.string().optional(),
      sourceUrl: z.string().optional().describe('source URL of the newsletter topic this post is based on'),
      sourceName: z.string().optional(),
    }),
    run: async ({ id, ...patch }) => {
      const post = await updatePost(id, patch)
      return post ? `updated post ${id} → ${post.status}` : 'NOT_FOUND'
    },
  })

  const generateImageTool = betaZodTool({
    name: 'generate_image',
    description:
      'Generate an on-brand EasyBIM cover image for a post (by id), store it in the Marketing drive, and set it as the post\'s image. Use on a "ready" post before publishing.',
    inputSchema: z.object({ id: z.string() }),
    run: async ({ id }) => {
      const res = await generateImageForPost(id)
      return res ? `generated + linked cover image: ${res.imageUrl}` : 'NOT_FOUND'
    },
  })

  return [listPostsTool, readPostTool, createPostTool, updatePostTool, generateImageTool]
}

export { POST_STATUS_LABELS } from '@/lib/models/PeacockPost'
