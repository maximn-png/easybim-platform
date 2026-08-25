import mongoose, { Schema, Document, Model } from 'mongoose'

// Page-level LinkedIn analytics, one document per day. Separate from PeacockPost
// because page impressions exist independently of any single post (and on days
// nothing was published).
//
// Filled either by the analytics import (a page admin's CSV/XLSX export, which
// needs no API access) or by the LinkedIn sync cron once the org is connected.
export type DailySource = 'import' | 'linkedin'

export interface ILinkedInDaily extends Document {
  /** Local midnight of the day these numbers describe; unique per day. */
  date: Date
  impressions?: number
  uniqueImpressions?: number
  /** Reactions + comments + reposts + clicks, as LinkedIn reports them. */
  engagements?: number
  clicks?: number
  followers?: number // total followers at end of day
  followersGained?: number
  source: DailySource
  createdAt: Date
  updatedAt: Date
}

const LinkedInDailySchema = new Schema<ILinkedInDaily>(
  {
    date: { type: Date, required: true, unique: true },
    impressions: Number,
    uniqueImpressions: Number,
    engagements: Number,
    clicks: Number,
    followers: Number,
    followersGained: Number,
    source: { type: String, enum: ['import', 'linkedin'], default: 'import' },
  },
  { timestamps: true }
)

LinkedInDailySchema.index({ date: -1 })

const LinkedInDaily: Model<ILinkedInDaily> =
  mongoose.models.LinkedInDaily ??
  mongoose.model<ILinkedInDaily>('LinkedInDaily', LinkedInDailySchema, 'peacock_linkedin_daily')

export default LinkedInDaily
