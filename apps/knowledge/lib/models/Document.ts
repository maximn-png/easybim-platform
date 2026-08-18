import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// A digested Knowledge Center document — the stored copy `KC.API.getDocument`
// serves from here on (see design_handoff_knowledge_center_backend/README.md:
// "the digested copy is stored as our own record and from then on is the only
// thing the app reads or writes"). Block shape matches Block Contract.md v1.

export type BlockContractType = 'h' | 'p' | 'ul' | 'ol' | 'callout' | 'fig'

export interface ContractBlock {
  t: BlockContractType
  // heading
  lvl?: number
  num?: string
  anchor?: string
  // paragraph / heading / callout
  txt?: string
  sub?: boolean
  link?: string
  // list
  items?: string[]
  sq?: boolean
  // figure
  id?: string
  cap?: string
}

export interface TocEntry {
  txt: string
  anchor: string
  lvl?: number
  num?: string
}

export interface DocLink {
  title: string
  kind: 'internal' | 'external'
  href: string
}

export interface VersionHistoryEntry {
  v: string
  date: string
  who: string
}

export interface DigestIssue {
  code: string
  at: number
  detail: string
}

// A translated copy of `blocks`, in the exact same order, carrying both
// target languages together (one Gemini pass unlocks both RU and EN — the
// third language, Hebrew, is simply the original source text, no AI call
// needed). Cached per document and invalidated by `forVersion` so an edit
// (bumping `version`) doesn't serve a stale translation — see
// design_handoff_knowledge_center_backend/spec/Integration Points.md section 5:
// "Cache per documentId × lang and invalidate when document.version changes."
export interface TranslatedBlock {
  // Same shape kc-app.js's KC.trRender() already knows how to paint — it only
  // supports k:'h'|'p'|'ul' (see public/kc/kc-app.js), so 'ol' and 'callout'
  // blocks are mapped down to 'ul'/'p' when building this; 'fig' blocks (no
  // translatable text) are omitted entirely.
  k: 'h' | 'p' | 'ul'
  lvl?: number
  num?: string
  anchor?: string
  sub?: boolean
  ru?: string
  en?: string
  items?: { ru: string; en: string }[]
}

export interface DocTranslation {
  forVersion: number
  title: { ru: string; en: string }
  series: { ru: string; en: string }
  blocks: TranslatedBlock[]
  translatedAt: Date
}

export type DocumentStatus = 'ready' | 'importing' | 'not_imported' | 'error'

export interface IDocument extends MongooseDocument {
  sourceDocId: string
  workspaceId: string
  title: string
  code?: string
  series?: string
  status: DocumentStatus
  errorMessage?: string
  sourceUrl?: string
  version: number
  blocks: ContractBlock[]
  toc: TocEntry[]
  links: DocLink[]
  versionHistory: VersionHistoryEntry[]
  digestIssues: DigestIssue[]
  importedAt?: Date
  contractVersion: number
  translation?: DocTranslation
  createdAt: Date
  updatedAt: Date
}

const ContractBlockSchema = new Schema<ContractBlock>(
  {
    t: { type: String, required: true, enum: ['h', 'p', 'ul', 'ol', 'callout', 'fig'] },
    lvl: Number,
    num: String,
    anchor: String,
    txt: String,
    sub: Boolean,
    link: String,
    items: [String],
    sq: Boolean,
    id: String,
    cap: String,
  },
  { _id: false }
)

const TocEntrySchema = new Schema<TocEntry>(
  {
    txt: { type: String, required: true },
    anchor: { type: String, required: true },
    lvl: Number,
    num: String,
  },
  { _id: false }
)

const DocLinkSchema = new Schema<DocLink>(
  {
    title: { type: String, required: true },
    kind: { type: String, enum: ['internal', 'external'], required: true },
    href: { type: String, required: true },
  },
  { _id: false }
)

const VersionHistoryEntrySchema = new Schema<VersionHistoryEntry>(
  {
    v: { type: String, required: true },
    date: { type: String, required: true },
    who: { type: String, required: true },
  },
  { _id: false }
)

const DigestIssueSchema = new Schema<DigestIssue>(
  {
    code: { type: String, required: true },
    at: { type: Number, required: true },
    detail: { type: String, default: '' },
  },
  { _id: false }
)

const TranslatedBlockSchema = new Schema<TranslatedBlock>(
  {
    k: { type: String, required: true, enum: ['h', 'p', 'ul'] },
    lvl: Number,
    num: String,
    anchor: String,
    sub: Boolean,
    ru: String,
    en: String,
    items: [{ ru: String, en: String, _id: false }],
  },
  { _id: false }
)

const DocTranslationSchema = new Schema<DocTranslation>(
  {
    forVersion: { type: Number, required: true },
    title: { ru: String, en: String, _id: false },
    series: { ru: String, en: String, _id: false },
    blocks: { type: [TranslatedBlockSchema], default: [] },
    translatedAt: { type: Date, required: true },
  },
  { _id: false }
)

const DocumentSchema = new Schema<IDocument>(
  {
    sourceDocId: { type: String, required: true, unique: true, index: true },
    workspaceId: { type: String, required: true },
    title: { type: String, required: true },
    code: String,
    series: String,
    status: {
      type: String,
      enum: ['ready', 'importing', 'not_imported', 'error'],
      required: true,
      default: 'not_imported',
    },
    errorMessage: String,
    sourceUrl: String,
    version: { type: Number, default: 1 },
    blocks: { type: [ContractBlockSchema], default: [] },
    toc: { type: [TocEntrySchema], default: [] },
    links: { type: [DocLinkSchema], default: [] },
    versionHistory: { type: [VersionHistoryEntrySchema], default: [] },
    digestIssues: { type: [DigestIssueSchema], default: [] },
    importedAt: Date,
    contractVersion: { type: Number, default: 1 },
    translation: DocTranslationSchema,
  },
  { timestamps: true }
)

DocumentSchema.index({ workspaceId: 1 })

const DocumentModel =
  (mongoose.models.Document as mongoose.Model<IDocument>) ??
  mongoose.model<IDocument>('Document', DocumentSchema)

export default DocumentModel
