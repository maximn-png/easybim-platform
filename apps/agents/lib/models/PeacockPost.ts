import mongoose, { Schema, Document, Model } from 'mongoose'

// A LinkedIn post Peacock plans/drafts. This is the local post store that
// replaces the Monday EasyBIM_Posts board — posts live here now.
//
// The status set mirrors the retired board's 8 labels, so the review loop
// survives the migration: Peacock drafts → pending_approval; Maxim approves in
// the dashboard (or sends it back with `revise`) → ready_to_publish → scheduled
// → published (published is always set by hand, after posting to LinkedIn).
export type PostStatus =
  | 'idea'
  | 'drafting'
  | 'pending_approval'
  | 'approved'
  | 'ready_to_publish'
  | 'scheduled'
  | 'published'
  | 'revise'

export const POST_STATUSES: PostStatus[] = [
  'idea',
  'drafting',
  'pending_approval',
  'approved',
  'ready_to_publish',
  'scheduled',
  'published',
  'revise',
]

/** Board-style display labels (what the Monday Status column showed). */
export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  idea: 'Idea',
  drafting: 'Drafting',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  ready_to_publish: 'Ready to Publish',
  scheduled: 'Scheduled',
  published: 'Published',
  revise: 'Revise',
}

/** Statuses that still need work from Peacock or Maxim (drives "in pipeline"). */
export const OPEN_STATUSES: PostStatus[] = ['idea', 'drafting', 'pending_approval', 'approved', 'revise']

// Post pillars (mirror of the old board PostType taxonomy — see brand.ts).
export const POST_TYPES = [
  '1. Professional',
  '2. Client Connection',
  '3. New Employee',
  '4. Project',
  '5. Social',
  '6. Personal',
  '7. Other',
] as const

/** Default length of the drafting window before publish (Gantt bar span), in days. */
export const DRAFT_WINDOW_DAYS = 4

/** Where a post's engagement numbers came from. */
export type MetricsSource = 'manual' | 'import' | 'linkedin'

/**
 * Engagement for the published post. Embedded rather than a side collection:
 * one post is one LinkedIn share, so the numbers have no life of their own.
 * Populated by hand in the drawer, by the analytics import, or by the LinkedIn
 * sync once the API is connected.
 */
export interface PostMetrics {
  impressions?: number
  reactions?: number
  comments?: number
  reposts?: number
  clicks?: number
  source?: MetricsSource
  syncedAt?: Date
}

const PostMetricsSchema = new Schema<PostMetrics>(
  {
    impressions: Number,
    reactions: Number,
    comments: Number,
    reposts: Number,
    clicks: Number,
    source: { type: String, enum: ['manual', 'import', 'linkedin'] },
    syncedAt: Date,
  },
  { _id: false }
)

/** Total interactions — the engagement figure shown next to a post. */
export function engagementTotal(m?: PostMetrics | null): number {
  if (!m) return 0
  return (m.reactions ?? 0) + (m.comments ?? 0) + (m.reposts ?? 0) + (m.clicks ?? 0)
}

/** Engagements ÷ impressions, as a percentage (null when impressions are unknown). */
export function engagementRate(m?: PostMetrics | null): number | null {
  if (!m?.impressions) return null
  return (engagementTotal(m) / m.impressions) * 100
}

export interface IPeacockPost extends Document {
  title: string
  body?: string // draft body (HTML or plain), RTL
  postType?: string
  status: PostStatus
  publishDate?: Date
  draftStartDate?: Date // start of the drafting window — the Gantt bar's left edge
  imageUrl?: string // generated/branded cover (Drive link, URL, or data ref)
  driveLink?: string // package folder
  linkedinUrl?: string // set once published to LinkedIn
  projectNumber?: string // for "4. Project" case-study posts
  notes?: string
  // Provenance when the idea came from the BIM newsletter (see peacock/newsletter.ts)
  sourceUrl?: string
  sourceName?: string
  metrics?: PostMetrics // LinkedIn engagement once published
  ownerUserId?: string // Clerk userId of the owner (Monday's Owner column)
  ownerName?: string // denormalized so the list renders avatars without a Clerk round-trip
  ownerImageUrl?: string
  mondayItemId?: string // provenance from the one-off board import; keeps it idempotent
  createdBy?: string // Clerk userId
  createdAt: Date
  updatedAt: Date
}

const PeacockPostSchema = new Schema<IPeacockPost>(
  {
    title: { type: String, required: true },
    body: String,
    postType: String,
    status: { type: String, enum: POST_STATUSES, default: 'idea', index: true },
    publishDate: Date,
    draftStartDate: Date,
    imageUrl: String,
    driveLink: String,
    linkedinUrl: String,
    projectNumber: String,
    notes: String,
    sourceUrl: String,
    sourceName: String,
    metrics: PostMetricsSchema,
    ownerUserId: String,
    ownerName: String,
    ownerImageUrl: String,
    mondayItemId: String,
    createdBy: String,
  },
  { timestamps: true }
)

PeacockPostSchema.index({ status: 1, publishDate: 1 })
PeacockPostSchema.index({ mondayItemId: 1 }, { sparse: true })
PeacockPostSchema.index({ sourceUrl: 1 }, { sparse: true }) // "is this newsletter topic used?"

const PeacockPost: Model<IPeacockPost> =
  mongoose.models.PeacockPost ??
  mongoose.model<IPeacockPost>('PeacockPost', PeacockPostSchema, 'peacock_posts')

export default PeacockPost
