import mongoose, { Schema, Document, Model } from 'mongoose'

// A LinkedIn post Peacock plans/drafts. This is the local post store that
// replaces the Monday EasyBIM_Posts board — posts live here now.
export type PostStatus = 'idea' | 'drafting' | 'ready' | 'scheduled' | 'published'

export const POST_STATUSES: PostStatus[] = ['idea', 'drafting', 'ready', 'scheduled', 'published']

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

export interface IPeacockPost extends Document {
  title: string
  body?: string // draft body (HTML or plain), RTL
  postType?: string
  status: PostStatus
  publishDate?: Date
  imageUrl?: string // generated/branded cover (Drive link, URL, or data ref)
  driveLink?: string // package folder
  linkedinUrl?: string // set once published to LinkedIn
  projectNumber?: string // for "4. Project" case-study posts
  notes?: string
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
    imageUrl: String,
    driveLink: String,
    linkedinUrl: String,
    projectNumber: String,
    notes: String,
    createdBy: String,
  },
  { timestamps: true }
)

PeacockPostSchema.index({ status: 1, publishDate: 1 })

const PeacockPost: Model<IPeacockPost> =
  mongoose.models.PeacockPost ??
  mongoose.model<IPeacockPost>('PeacockPost', PeacockPostSchema, 'peacock_posts')

export default PeacockPost
