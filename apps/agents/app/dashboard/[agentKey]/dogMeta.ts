// Shared types + visual constants for 🐕 Dog's dashboard (mirrors postMeta.ts).
import type { CSSProperties } from 'react'

export const TEAL = '#0f766e'
export const TEAL_2 = '#14b8a6'

export const CARD: CSSProperties = {
  background: '#fff',
  border: '1px solid #e6efee',
  borderRadius: 18,
  boxShadow: '0 2px 10px rgba(15,118,110,.06)',
}

export const MAX_PREVIOUS_CONTRACTS = 3

export type Verification = 'confirmed' | 'suspect'

export interface IssueRow {
  page: string
  section: string
  description: string
  fix: string
  dropped?: boolean
  /** one note per compared contract, in the order of the review's previousLabels */
  prevNotes?: string[]
  /** evidence-verification outcome; absent until the verify pass judged the row */
  verification?: Verification
  verificationNote?: string
}

/** A contract already signed with this client, offered for comparison. */
export interface PreviousContractOption {
  fileId: string
  name: string
  mimeType: string
  modifiedTime: string | null
  projectLabel: string
  projectFolderId: string
}

export interface PreviousContractSuggestions {
  client: string | null
  note: string | null
  options: PreviousContractOption[]
}

export interface ReviewDTO {
  id: string
  projectFolderId: string
  projectName: string
  agreementName: string
  quoteName: string
  /** column headers for the comparison; empty when nothing was compared */
  previousLabels: string[]
  /** 1 = the first review; 2+ = a check of a revised version the client sent back */
  round: number
  parentReviewId: string | null
  previousAgreementName: string | null
  /** round ≥ 2 only: one per comment we sent */
  verdicts: FindingVerdict[]
  verdictCounts: Record<Verdict, number> | null
  status: 'analyzing' | 'ready' | 'error'
  error: string | null
  /** state of the evidence-verification pass; null on reviews that predate it */
  verifyStatus: 'pending' | 'running' | 'done' | 'error' | null
  verifyError: string | null
  issues: IssueRow[]
  issueCount: number
  openCount: number
  edited: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectFolder {
  id: string
  name: string
}

export interface CandidateFile {
  fileId: string
  name: string
  mimeType: string
  modifiedTime: string | null
  webViewLink?: string | null
}

export interface SlotInspection {
  folder: string
  folderId: string | null
  candidates: CandidateFile[]
  suggestedFileId: string | null
}

export interface ProjectInspection {
  projectFolderId: string
  projectName: string
  agreement: SlotInspection
  quote: SlotInspection
}

export interface ChecklistTopic {
  title: string
  detail: string
}

export interface Checklist {
  topics: ChecklistTopic[]
  ignore: string[]
  version: number
}

export const STATUS_META: Record<ReviewDTO['status'], { label: string; color: string }> = {
  analyzing: { label: 'בבדיקה', color: '#f59e0b' },
  ready: { label: 'מוכן לעריכה', color: TEAL },
  error: { label: 'שגיאה', color: '#e5484d' },
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** The findings as a letter body, ready to paste into an email. */
export function issuesAsText(review: { projectName: string; issues: IssueRow[] }): string {
  const kept = review.issues.filter((i) => !i.dropped)
  const today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  const lines = [`הערות להסכם — ${review.projectName}`, today, '']
  kept.forEach((issue, i) => {
    const where = [issue.page && `עמוד ${issue.page}`, issue.section && `סעיף ${issue.section}`]
      .filter(Boolean)
      .join(', ')
    lines.push(`${i + 1}. ${where}`)
    lines.push(issue.description)
    if (issue.fix) lines.push(`תיקון מוצע: ${issue.fix}`)
    lines.push('')
  })
  return lines.join('\n')
}

// ── Follow-up rounds (V2 and later) ───────────────────────────────────────────

export type Verdict = 'fixed' | 'partial' | 'not_fixed' | 'worse' | 'removed' | 'not_found'

export interface FindingVerdict {
  source: { page: string; section: string; description: string; fix: string }
  verdict: Verdict
  newPage?: string
  newSection?: string
  evidence?: string
  note?: string
  remaining?: string
  dropped?: boolean
  verification?: Verification
  verificationNote?: string
}

/** Ordered for the summary bar: wins first, then what still needs chasing. */
export const VERDICT_ORDER: Verdict[] = ['fixed', 'removed', 'partial', 'not_fixed', 'worse', 'not_found']

export const VERDICT_META: Record<Verdict, { label: string; color: string; resolved: boolean }> = {
  fixed: { label: 'תוקן', color: '#16a34a', resolved: true },
  removed: { label: 'הסעיף הוסר', color: '#0d9488', resolved: true },
  partial: { label: 'תוקן חלקית', color: '#f59e0b', resolved: false },
  not_fixed: { label: 'לא תוקן', color: '#e5484d', resolved: false },
  worse: { label: 'הוחמר', color: '#b42318', resolved: false },
  not_found: { label: 'לא אותר', color: '#8a9391', resolved: false },
}

export interface FollowupCandidate {
  fileId: string
  name: string
  mimeType: string
  modifiedTime: string | null
}

/**
 * The follow-up letter: what got resolved, what is still open, what the revision
 * introduced. Evidence quotes stay out — they are how you check Dog, not
 * something to send back to the client.
 */
export function followupAsText(review: {
  projectName: string
  round: number
  verdicts: FindingVerdict[]
  issues: IssueRow[]
}): string {
  const kept = review.verdicts.filter((v) => !v.dropped)
  const resolved = kept.filter((v) => VERDICT_META[v.verdict].resolved)
  const open = kept.filter((v) => !VERDICT_META[v.verdict].resolved)
  const fresh = review.issues.filter((i) => !i.dropped)
  const today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

  const lines = [`הערות לגרסה ${review.round} — ${review.projectName}`, today, '']
  lines.push(`מתוך ${kept.length} ההערות ששלחנו, ${resolved.length} נענו בגרסה זו. תודה.`, '')

  if (open.length) {
    lines.push('ההערות הבאות טרם נסגרו:', '')
    open.forEach((v, i) => {
      const where = [v.newPage && `עמוד ${v.newPage}`, v.newSection && `סעיף ${v.newSection}`]
        .filter(Boolean)
        .join(', ')
      lines.push(`${i + 1}. ${where || v.source.section}  [${VERDICT_META[v.verdict].label}]`)
      lines.push(v.source.description)
      lines.push(`הנדרש: ${v.remaining || v.source.fix}`)
      lines.push('')
    })
  }

  if (fresh.length) {
    lines.push('בנוסף, בגרסה זו נוספו הסעיפים הבאים שלא נדונו קודם:', '')
    fresh.forEach((issue, i) => {
      const where = [issue.page && `עמוד ${issue.page}`, issue.section && `סעיף ${issue.section}`]
        .filter(Boolean)
        .join(', ')
      lines.push(`${open.length + i + 1}. ${where}`)
      lines.push(issue.description)
      if (issue.fix) lines.push(`תיקון מוצע: ${issue.fix}`)
      lines.push('')
    })
  }

  if (!open.length && !fresh.length) lines.push('כל ההערות נענו. מבחינתנו ההסכם מוכן לחתימה.')

  return lines.join('\n')
}
