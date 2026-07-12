import mongoose, { Schema, Document, Model } from 'mongoose'

// Nightly Drive→Mongo content mirror for one price-quote project (keyed by the
// Monday item id, like QuoteRecord). Holds the quote Doc's tables + plain text,
// the work-plan Sheet's detail tabs, and the project folder's file inventory,
// each stamped with Drive modifiedTime so the sync (and chat tools) re-fetch
// only files that actually changed. Drive stays the source of truth.

export interface CachedDoc {
  fileId: string
  url: string
  modifiedTime: string
  title: string
  tables: string[][][] // [table][row][cell] — same shape as getDocTables()
  text: string
  syncedAt: Date
}

export interface CachedSheet {
  fileId: string
  url: string
  modifiedTime: string
  tabs: Record<string, string[][]> // tab → cell grid — same shape as readSheetTabs()
  syncedAt: Date
}

export interface CachedFolderFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string | null
}

export interface CachedFolder {
  folderId: string
  files: CachedFolderFile[]
  syncedAt: Date
}

export interface IQuoteContent extends Document {
  itemId: string // Monday item id (unique key, joins to QuoteRecord)
  doc?: CachedDoc | null
  sheet?: CachedSheet | null
  folder?: CachedFolder | null
  lastSyncedAt: Date
  lastError?: string | null
}

const QuoteContentSchema = new Schema<IQuoteContent>(
  {
    itemId: { type: String, required: true, unique: true, index: true },
    doc: {
      type: new Schema<CachedDoc>(
        {
          fileId: String,
          url: String,
          modifiedTime: String,
          title: String,
          tables: Schema.Types.Mixed,
          text: String,
          syncedAt: Date,
        },
        { _id: false }
      ),
      default: null,
    },
    sheet: {
      type: new Schema<CachedSheet>(
        {
          fileId: String,
          url: String,
          modifiedTime: String,
          tabs: Schema.Types.Mixed,
          syncedAt: Date,
        },
        { _id: false }
      ),
      default: null,
    },
    folder: {
      type: new Schema<CachedFolder>(
        {
          folderId: String,
          files: [
            new Schema<CachedFolderFile>(
              { id: String, name: String, mimeType: String, modifiedTime: String },
              { _id: false }
            ),
          ],
          syncedAt: Date,
        },
        { _id: false }
      ),
      default: null,
    },
    lastSyncedAt: { type: Date, default: Date.now, index: true },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
)

// Cross-quote content search ("which quotes mention X") — also the retrieval
// building block for drafting new quotes from similar old ones.
QuoteContentSchema.index({ 'doc.text': 'text', 'doc.title': 'text' })

const QuoteContent: Model<IQuoteContent> =
  mongoose.models.QuoteContent ??
  mongoose.model<IQuoteContent>('QuoteContent', QuoteContentSchema, 'squirrel_quote_contents')

export default QuoteContent
