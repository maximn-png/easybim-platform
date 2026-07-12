import mongoose, { Schema, Document, Model } from 'mongoose'

// One indexed record per Monday price-quote item (board MA-001-Price Quotes).
// Populated by lib/agents/squirrel/quoteIndex.ts (Monday columns + area from the
// linked work-plan sheet), so the advisor chat can filter / aggregate / compare
// quotes fast without hitting Monday or Drive per question.
export interface IQuoteRecord extends Document {
  itemId: string // Monday item id (unique key)
  name: string
  quoteNumber?: string | null // מספר הצעה
  client?: string | null // = developer (יזם ראשי); primary grouping dimension
  // ── the six contact parties from MA-006-Contacts (mirror/relation display_value) ──
  developer?: string | null // יזם ראשי
  developerContact?: string | null // איש קשר מטעם היזם
  projectManagement?: string | null // ניהול הפרויקט
  projectManagerContact?: string | null // איש קשר מטעם מנהל פרויקט
  workOrderer?: string | null // מזמין העבודה
  workOrdererContact?: string | null // איש קשר טעם מזמין העבודה
  location?: string | null // מקום
  service?: string | null // שירות
  projectType?: string | null // סוג פרויקט (A/B/C/…)
  usageType?: string | null // סוג השימוש (מגורים/משולב/…)
  stage?: string | null // שלב
  price?: number | null // מחיר (₪)
  status?: string | null // סטאטוס
  owner?: string | null // אחראי
  quoteSentDate?: string | null // YYYY-MM-DD
  responseDate?: string | null // YYYY-MM-DD
  sheetUrl?: string | null // link_mm1ebc51 (work-plan Sheets)
  docUrl?: string | null // link_mm1hr4hg (quote Doc)
  driveFolderUrl?: string | null // link_mm3wdkkz (project folder)
  sheetId?: string | null // parsed from sheetUrl
  areaSqm?: number | null // total project area (m²), from the sheet
  areaSyncedAt?: Date | null
  lastSyncedAt: Date
}

const QuoteRecordSchema = new Schema<IQuoteRecord>(
  {
    itemId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    quoteNumber: String,
    client: { type: String, index: true },
    developer: { type: String, index: true },
    developerContact: String,
    projectManagement: { type: String, index: true },
    projectManagerContact: String,
    workOrderer: { type: String, index: true },
    workOrdererContact: String,
    location: String,
    service: { type: String, index: true },
    projectType: { type: String, index: true },
    usageType: { type: String, index: true },
    stage: String,
    price: Number,
    status: { type: String, index: true },
    owner: String,
    quoteSentDate: String,
    responseDate: String,
    sheetUrl: String,
    docUrl: String,
    driveFolderUrl: String,
    sheetId: String,
    areaSqm: Number,
    areaSyncedAt: Date,
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

const QuoteRecord: Model<IQuoteRecord> =
  mongoose.models.QuoteRecord ?? mongoose.model<IQuoteRecord>('QuoteRecord', QuoteRecordSchema, 'squirrel_quotes')

export default QuoteRecord
