import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IStyleProfile extends Document {
  userId: string
  linkedinPosts: string[]
  styleNotes: string
  cohereApiKey?: string
  geminiApiKey?: string
  updatedAt: Date
}

const StyleProfileSchema = new Schema<IStyleProfile>(
  {
    userId: { type: String, required: true, unique: true },
    linkedinPosts: [String],
    styleNotes: String,
    cohereApiKey: String,
    geminiApiKey: String,
  },
  { timestamps: true }
)

const StyleProfile: Model<IStyleProfile> =
  mongoose.models.StyleProfile ?? mongoose.model<IStyleProfile>('StyleProfile', StyleProfileSchema)

export default StyleProfile
