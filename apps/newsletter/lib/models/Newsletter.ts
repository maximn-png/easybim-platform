import mongoose, { Schema, Document, Model } from 'mongoose'

export interface TopicItem {
  title: string
  body: string
  sourceUrl: string
  sourceName: string
  imageBase64?: string
  imagePrompt?: string
}

export interface INewsletter extends Document {
  title: string
  date: Date
  topics: TopicItem[]
  rawRssItems?: object[]
  llmProvider: 'cohere' | 'gemini'
  htmlOutput?: string
  status: 'draft' | 'ready'
  userId: string
}

const TopicSchema = new Schema<TopicItem>({
  title: String,
  body: String,
  sourceUrl: String,
  sourceName: String,
  imageBase64: String,
  imagePrompt: String,
})

const NewsletterSchema = new Schema<INewsletter>(
  {
    title: String,
    date: { type: Date, default: Date.now },
    topics: [TopicSchema],
    rawRssItems: [Schema.Types.Mixed],
    llmProvider: { type: String, enum: ['cohere', 'gemini'] },
    htmlOutput: String,
    status: { type: String, enum: ['draft', 'ready'], default: 'draft' },
    userId: String,
  },
  { timestamps: true }
)

NewsletterSchema.index({ userId: 1, date: -1 })

const Newsletter: Model<INewsletter> =
  mongoose.models.Newsletter ?? mongoose.model<INewsletter>('Newsletter', NewsletterSchema)

export default Newsletter
