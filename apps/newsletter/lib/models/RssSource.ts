import mongoose, { Schema, Document, Model } from 'mongoose'

export type RssCategory = 'bim' | 'ai-bim' | 'infrastructure' | 'israel-gov' | 'construction' | 'mep-coordination'

export interface IRssSource extends Document {
  name: string
  url: string
  category: RssCategory
  isActive: boolean
  lastFetched?: Date
  userId: string
}

const RssSourceSchema = new Schema<IRssSource>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    category: {
      type: String,
      enum: ['bim', 'ai-bim', 'infrastructure', 'israel-gov', 'construction', 'mep-coordination'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    lastFetched: Date,
    userId: { type: String, required: true },
  },
  { timestamps: true }
)

const RssSource: Model<IRssSource> =
  mongoose.models.RssSource ?? mongoose.model<IRssSource>('RssSource', RssSourceSchema)

export default RssSource
