// Local post store (replaces Monday) + chat/author tools to plan and draft posts.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongoose'
import PeacockPost, { IPeacockPost, POST_STATUSES, POST_TYPES, PostStatus } from '@/lib/models/PeacockPost'
import { generatePostImage } from './image'
import { getSharedDriveId, findChildFolder, createFolder, uploadBytes } from '@/lib/integrations/google/client'

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
  imageUrl: string | null
  driveLink: string | null
  linkedinUrl: string | null
  projectNumber: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export function serializePost(p: IPeacockPost | Record<string, unknown>): PostDTO {
  const d = p as IPeacockPost & { _id: unknown }
  return {
    id: String(d._id),
    title: d.title,
    body: d.body ?? null,
    postType: d.postType ?? null,
    status: (d.status as PostStatus) ?? 'idea',
    publishDate: d.publishDate ? new Date(d.publishDate).toISOString() : null,
    imageUrl: d.imageUrl ?? null,
    driveLink: d.driveLink ?? null,
    linkedinUrl: d.linkedinUrl ?? null,
    projectNumber: d.projectNumber ?? null,
    notes: d.notes ?? null,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : '',
  }
}

export async function listPosts(filter: { status?: PostStatus } = {}): Promise<PostDTO[]> {
  await connectDB()
  const q: Record<string, unknown> = {}
  if (filter.status) q.status = filter.status
  const docs = await PeacockPost.find(q).sort({ publishDate: 1, createdAt: -1 }).limit(200).lean()
  return docs.map((d) => serializePost(d as unknown as IPeacockPost))
}

/** Counts per status — backs the dashboard Content Pipeline donut + stat cards. */
export async function pipelineCounts(): Promise<Record<PostStatus, number> & { total: number }> {
  await connectDB()
  const rows = await PeacockPost.aggregate<{ _id: PostStatus; n: number }>([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ])
  const out = { idea: 0, drafting: 0, ready: 0, scheduled: 0, published: 0, total: 0 }
  for (const r of rows) {
    if (r._id in out) out[r._id] = r.n
    out.total += r.n
  }
  return out
}

export interface CreatePostInput {
  title: string
  body?: string
  postType?: string
  status?: PostStatus
  publishDate?: string
  projectNumber?: string
  notes?: string
  createdBy?: string
}

export async function createPost(input: CreatePostInput): Promise<PostDTO> {
  await connectDB()
  const doc = await PeacockPost.create({
    title: input.title,
    body: input.body,
    postType: input.postType,
    status: input.status ?? 'idea',
    publishDate: input.publishDate ? new Date(input.publishDate) : undefined,
    projectNumber: input.projectNumber,
    notes: input.notes,
    createdBy: input.createdBy,
  })
  return serializePost(doc)
}

export type UpdatePostInput = Partial<
  Pick<
    IPeacockPost,
    'title' | 'body' | 'postType' | 'status' | 'imageUrl' | 'driveLink' | 'linkedinUrl' | 'projectNumber' | 'notes'
  >
> & { publishDate?: string | null }

export async function updatePost(id: string, patch: UpdatePostInput): Promise<PostDTO | null> {
  await connectDB()
  const set: Record<string, unknown> = { ...patch }
  if ('publishDate' in patch) {
    set.publishDate = patch.publishDate ? new Date(patch.publishDate) : null
  }
  const doc = await PeacockPost.findByIdAndUpdate(id, { $set: set }, { new: true }).lean()
  return doc ? serializePost(doc as unknown as IPeacockPost) : null
}

export async function deletePost(id: string): Promise<boolean> {
  await connectDB()
  const res = await PeacockPost.findByIdAndDelete(id).lean()
  return !!res
}

// ---- chat/author tools -----------------------------------------------------

export function makePostTools(userId?: string) {
  const listPostsTool = betaZodTool({
    name: 'list_posts',
    description:
      'List planned/drafted LinkedIn posts from the content plan (the local post store). Optionally filter by status. Prefer developing existing posts over creating new ones.',
    inputSchema: z.object({ status: z.enum(POST_STATUSES as [PostStatus, ...PostStatus[]]).optional() }),
    run: async ({ status }) => JSON.stringify(await listPosts(status ? { status } : {})),
  })

  const createPostTool = betaZodTool({
    name: 'create_post',
    description:
      'Add a post to the content plan. Provide a title; optionally a PostType, a draft body (RTL HTML), a publish date (YYYY-MM-DD), and a project number for case-study posts. New posts default to status "idea".',
    inputSchema: z.object({
      title: z.string(),
      postType: z.enum(POST_TYPES).optional(),
      body: z.string().optional(),
      publishDate: z.string().optional().describe('YYYY-MM-DD'),
      status: z.enum(POST_STATUSES as [PostStatus, ...PostStatus[]]).optional(),
      projectNumber: z.string().optional(),
    }),
    run: async (args) => {
      const post = await createPost({ ...args, createdBy: userId })
      return `created post ${post.id} (${post.status})`
    },
  })

  const updatePostTool = betaZodTool({
    name: 'update_post',
    description:
      'Update a post in the content plan by id: set body (RTL HTML draft), postType, status (idea/drafting/ready/scheduled/published), publishDate (YYYY-MM-DD or null), notes, or linkedinUrl. Use to develop a draft or move it through the plan.',
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      postType: z.enum(POST_TYPES).optional(),
      status: z.enum(POST_STATUSES as [PostStatus, ...PostStatus[]]).optional(),
      publishDate: z.string().nullable().optional(),
      notes: z.string().optional(),
      linkedinUrl: z.string().optional(),
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

  return [listPostsTool, createPostTool, updatePostTool, generateImageTool]
}

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  idea: 'Idea',
  drafting: 'Drafting',
  ready: 'Ready',
  scheduled: 'Scheduled',
  published: 'Published',
}
