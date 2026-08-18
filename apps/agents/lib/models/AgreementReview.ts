import mongoose, { Schema, Document, Model } from 'mongoose'

// One agreement review: the client's agreement compared against the price quote
// we sent, analysed against Dog's checklist. Replaces the local Python tool's
// Google-Docs report + originals/<docId>.json pair — the findings live here and
// the dashboard table IS the deliverable.

export type ReviewStatus = 'analyzing' | 'ready' | 'error'
export const REVIEW_STATUSES: ReviewStatus[] = ['analyzing', 'ready', 'error']

/** One finding. Mirrors the columns of the old report table. */
export interface ReviewIssue {
  page: string
  section: string
  description: string
  fix: string
  /** dropped findings stay in the doc (they are learning signal) but leave the letter */
  dropped?: boolean
  /**
   * How this same clause stood in each previously signed contract, in the order
   * of `previousContracts` — "הופיע וטופל", "לא הופיע", "נוסח מתון יותר".
   * The old report's X1/X2/X3 columns, as plain fields.
   */
  prevNotes?: string[]
}

const ReviewIssueSchema = new Schema<ReviewIssue>(
  {
    page: { type: String, default: '' },
    section: { type: String, default: '' },
    description: { type: String, default: '' },
    fix: { type: String, default: '' },
    dropped: { type: Boolean, default: false },
    prevNotes: { type: [String], default: undefined },
  },
  { _id: false }
)

/** A file Dog read, as it was resolved at run time. */
export interface ReviewSource {
  fileId: string
  name: string
  mimeType: string
}

const ReviewSourceSchema = new Schema<ReviewSource>(
  { fileId: String, name: String, mimeType: String },
  { _id: false }
)

/** A previously signed contract this review was compared against (max 3). */
export interface PreviousContract extends ReviewSource {
  /** which project it came from, e.g. "205 - בורוכוב 14 רעננה" — the column header */
  projectLabel: string
}

const PreviousContractSchema = new Schema<PreviousContract>(
  { fileId: String, name: String, mimeType: String, projectLabel: String },
  { _id: false }
)

/** How one comment we sent fared in the revised contract the client sent back. */
export type Verdict = 'fixed' | 'partial' | 'not_fixed' | 'worse' | 'removed' | 'not_found'

export const VERDICTS: Verdict[] = ['fixed', 'partial', 'not_fixed', 'worse', 'removed', 'not_found']

/** Verdicts that leave something to ask for in the next letter. */
export const UNRESOLVED_VERDICTS: Verdict[] = ['partial', 'not_fixed', 'worse', 'not_found']

export interface FindingVerdict {
  /**
   * A COPY of the comment as it was sent, not a reference — the parent review
   * stays editable, and a verdict row must keep saying what it was judged against.
   */
  source: { page: string; section: string; description: string; fix: string }
  verdict: Verdict
  /** where that clause sits in the new version — clients renumber constantly */
  newPage?: string
  newSection?: string
  /** the exact quote from the new version the verdict rests on — never empty for a real verdict */
  evidence?: string
  /** what changed, in a sentence or two */
  note?: string
  /** what we should still ask for; empty when the comment is fully resolved */
  remaining?: string
  /** left out of the follow-up letter (kept on the record) */
  dropped?: boolean
}

const FindingVerdictSchema = new Schema<FindingVerdict>(
  {
    source: {
      page: { type: String, default: '' },
      section: { type: String, default: '' },
      description: { type: String, default: '' },
      fix: { type: String, default: '' },
    },
    verdict: { type: String, enum: VERDICTS, required: true },
    newPage: String,
    newSection: String,
    evidence: String,
    note: String,
    remaining: String,
    dropped: { type: Boolean, default: false },
  },
  { _id: false }
)

export interface IAgreementReview extends Document {
  projectFolderId: string
  projectName: string
  agreement: ReviewSource
  quote: ReviewSource
  /**
   * Review rounds. 1 = the first read of the agreement; 2+ = a check of a revised
   * version the client sent back after our comments. A round links to the one it
   * follows, so V3 can pick up whatever V2 left unresolved.
   */
  round: number
  parentReviewId?: string
  /** the version this round's agreement is compared against (round ≥ 2 only) */
  previousAgreement?: ReviewSource
  /** one per comment we sent — the agenda of a follow-up round */
  verdicts: FindingVerdict[]
  /** optional: contracts already signed with this client, for the per-finding comparison */
  previousContracts: PreviousContract[]
  status: ReviewStatus
  error?: string
  /**
   * The findings. In round 1 these are the review; in a follow-up round they are
   * the problems the revision *introduced* — the verdicts carry the old agenda.
   */
  issues: ReviewIssue[]
  /** frozen model output; the diff against `issues` is the learning signal (Phase 2) */
  issuesOriginal: ReviewIssue[]
  /** which checklist version produced this review */
  checklistVersion?: number
  runId?: string
  inputTokens?: number
  outputTokens?: number
  createdBy?: string
  createdAt: Date
  updatedAt: Date
}

const AgreementReviewSchema = new Schema<IAgreementReview>(
  {
    projectFolderId: { type: String, required: true, index: true },
    projectName: { type: String, required: true },
    agreement: ReviewSourceSchema,
    quote: ReviewSourceSchema,
    round: { type: Number, default: 1, index: true },
    parentReviewId: { type: String, index: true, sparse: true },
    previousAgreement: ReviewSourceSchema,
    verdicts: { type: [FindingVerdictSchema], default: [] },
    previousContracts: { type: [PreviousContractSchema], default: [] },
    status: { type: String, enum: REVIEW_STATUSES, default: 'analyzing', index: true },
    error: String,
    issues: { type: [ReviewIssueSchema], default: [] },
    issuesOriginal: { type: [ReviewIssueSchema], default: [] },
    checklistVersion: Number,
    runId: String,
    inputTokens: Number,
    outputTokens: Number,
    createdBy: String,
  },
  { timestamps: true }
)

AgreementReviewSchema.index({ createdAt: -1 })

const AgreementReview: Model<IAgreementReview> =
  mongoose.models.AgreementReview ??
  mongoose.model<IAgreementReview>('AgreementReview', AgreementReviewSchema, 'dog_agreement_reviews')

export default AgreementReview
