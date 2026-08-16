// Client-safe post constants shared by the dashboard, the posts board and the
// drawer. Mirrors lib/models/PeacockPost.ts, which can't be imported into a
// client bundle (it pulls in mongoose).

export type PostStatus =
  | 'idea'
  | 'drafting'
  | 'pending_approval'
  | 'approved'
  | 'ready_to_publish'
  | 'scheduled'
  | 'published'
  | 'revise'

export type MetricsSource = 'manual' | 'import' | 'linkedin'

export interface PostMetrics {
  impressions?: number
  reactions?: number
  comments?: number
  reposts?: number
  clicks?: number
  source?: MetricsSource
  syncedAt?: string
}

export interface PostDTO {
  id: string
  title: string
  body: string | null
  postType: string | null
  status: PostStatus
  publishDate: string | null
  draftStartDate: string | null
  imageUrl: string | null
  driveLink: string | null
  linkedinUrl: string | null
  projectNumber: string | null
  notes: string | null
  sourceUrl: string | null
  sourceName: string | null
  metrics: PostMetrics | null
  ownerUserId: string | null
  ownerName: string | null
  ownerImageUrl: string | null
  commentCount: number
  createdAt: string
  updatedAt: string
}

/** Total interactions on a post — mirrors engagementTotal in the model. */
export function engagementTotal(m?: PostMetrics | null): number {
  if (!m) return 0
  return (m.reactions ?? 0) + (m.comments ?? 0) + (m.reposts ?? 0) + (m.clicks ?? 0)
}

export function engagementRate(m?: PostMetrics | null): number | null {
  if (!m?.impressions) return null
  return (engagementTotal(m) / m.impressions) * 100
}

export interface PortalUser {
  id: string
  name: string
  email: string | null
  imageUrl: string | null
}

export const PURPLE = '#7b5cff'
export const PURPLE_2 = '#9d6bff'
export const CARD = {
  background: '#fff',
  border: '1px solid #eeecf6',
  borderRadius: 22,
  boxShadow: '0 6px 20px rgba(90,70,180,.05)',
}

/**
 * Funnel order: idea → drafting → pending_approval (waiting on Maxim) → revise
 * (bounced back to Peacock) → approved → ready_to_publish → scheduled → published.
 */
export const STATUS_ORDER: PostStatus[] = [
  'idea',
  'drafting',
  'pending_approval',
  'revise',
  'approved',
  'ready_to_publish',
  'scheduled',
  'published',
]

export const STATUS_META: Record<PostStatus, { label: string; color: string }> = {
  idea: { label: 'Idea', color: '#c9c2f0' },
  drafting: { label: 'Drafting', color: '#a78bfa' },
  pending_approval: { label: 'Pending Approval', color: '#fdab3d' },
  revise: { label: 'Revise', color: '#e2445c' },
  approved: { label: 'Approved', color: '#00c875' },
  ready_to_publish: { label: 'Ready to Publish', color: '#0ea5e9' },
  scheduled: { label: 'Scheduled', color: '#6366f1' },
  published: { label: 'Published', color: '#0f7a3d' },
}

/** Statuses still needing work from either side — the "in pipeline" stat. */
export const OPEN_STATUSES: PostStatus[] = ['idea', 'drafting', 'pending_approval', 'revise', 'approved']

export const POST_TYPES = [
  '1. Professional',
  '2. Client Connection',
  '3. New Employee',
  '4. Project',
  '5. Social',
  '6. Personal',
  '7. Other',
] as const

/** Distinct pastels per pillar, so the plan is scannable by type at a glance. */
export const TYPE_COLOR: Record<string, string> = {
  '1. Professional': '#579bfc',
  '2. Client Connection': '#00c875',
  '3. New Employee': '#a25ddc',
  '4. Project': '#0ea5e9',
  '5. Social': '#ff9f4a',
  '6. Personal': '#e2597e',
  '7. Other': '#9aa0ac',
}

export function typeColor(t: string | null): string {
  return (t && TYPE_COLOR[t]) || '#9aa0ac'
}

// ---- dates -----------------------------------------------------------------

export const DAY_MS = 86400000

/** Local midnight — all timeline math is done on whole local days. */
export function dayStart(d: Date | string): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Whole days from a to b (both floored to local midnight). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DAY_MS)
}

/** YYYY-MM-DD in local time (toISOString would shift the day in Israel). */
export function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fmtDayMon(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/** A dated, unpublished post whose date has passed — Monday's red "!" flag. */
export function isOverdue(post: PostDTO): boolean {
  if (!post.publishDate || post.status === 'published') return false
  return dayStart(post.publishDate) < dayStart(new Date())
}

/** Strip the draft's HTML to the plain text you paste into LinkedIn. */
export function bodyToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}
