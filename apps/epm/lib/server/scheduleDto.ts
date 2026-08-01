import 'server-only'
import type { ScheduleDTO, ScheduleFilters } from '@/lib/scheduleTypes'
import { computeNextRun, DEFAULT_TZ, type Frequency } from '@/lib/scheduleTime'

// Shared (de)serialisation for the schedule endpoints: one place that decides
// what a client may set, and what a client gets back.

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []

function parseFilters(v: unknown): ScheduleFilters {
  const o = (v ?? {}) as Record<string, unknown>
  const extraRaw = Array.isArray(o.extra) ? o.extra : []
  return {
    assignees:   strList(o.assignees),
    issueTypes:  strList(o.issueTypes),
    disciplines: strList(o.disciplines),
    statuses:    strList(o.statuses),
    extra: extraRaw
      .map(e => {
        const x = (e ?? {}) as Record<string, unknown>
        return { key: str(x.key), values: strList(x.values) }
      })
      .filter(e => e.key.length > 0),
  }
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n))
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
}

export function parseFrequency(v: unknown): Frequency {
  const o = (v ?? {}) as Record<string, unknown>
  const kind = o.kind === 'daily' || o.kind === 'weekly' || o.kind === 'monthly' ? o.kind : 'weekly'
  return {
    kind,
    weekday:    kind === 'weekly'  ? clamp(o.weekday, 0, 6, 0) : undefined,
    dayOfMonth: kind === 'monthly' ? clamp(o.dayOfMonth, 1, 31, 1) : undefined,
    hour:       clamp(o.hour, 0, 23, 9),
    minute:     clamp(o.minute, 0, 59, 0),
  }
}

// Basic email sanity — enough to keep obvious typos out of a recurring send.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ParsedScheduleInput {
  name:         string
  templateId:   string
  variantId?:   string
  groupBy:      string
  filters:      ScheduleFilters
  bodyText:     string
  modelLink?:   string
  recipients:   string[]
  deliveryMode: 'send' | 'draft'
  frequency:    Frequency
  timezone:     string
  active:       boolean
}

export function parseScheduleInput(body: unknown): { ok: true; value: ParsedScheduleInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>

  const templateId = str(b.templateId).trim()
  if (!templateId) return { ok: false, error: 'templateId is required' }

  const recipients = [...new Set(strList(b.recipients).map(r => r.trim().toLowerCase()))]
  if (recipients.length === 0) return { ok: false, error: 'At least one recipient is required' }
  const bad = recipients.find(r => !EMAIL_RE.test(r))
  if (bad) return { ok: false, error: `Invalid recipient address: ${bad}` }

  const bodyText = str(b.bodyText).trim()
  if (!bodyText) return { ok: false, error: 'Email body cannot be empty' }

  return {
    ok: true,
    value: {
      name:         str(b.name).trim() || 'Scheduled report',
      templateId,
      variantId:    str(b.variantId).trim() || undefined,
      groupBy:      str(b.groupBy).trim() || 'discipline',
      filters:      parseFilters(b.filters),
      bodyText,
      modelLink:    str(b.modelLink).trim() || undefined,
      recipients,
      deliveryMode: b.deliveryMode === 'draft' ? 'draft' : 'send',
      frequency:    parseFrequency(b.frequency),
      timezone:     str(b.timezone).trim() || DEFAULT_TZ,
      active:       b.active !== false,
    },
  }
}

// A schedule's next fire time from now, given its cadence + zone.
export const nextRunFor = (frequency: Frequency, timezone: string) =>
  computeNextRun(frequency, timezone)

const iso = (v: unknown): string | undefined => {
  if (!v) return undefined
  const d = v instanceof Date ? v : new Date(String(v))
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function serializeSchedule(
  d: Record<string, unknown>,
  project?: { projectName?: string; projectNumber?: string },
): ScheduleDTO {
  const history = Array.isArray(d.history) ? d.history as Record<string, unknown>[] : []
  return {
    _id:           String(d._id),
    projectId:     String(d.projectId),
    projectName:   project?.projectName,
    projectNumber: project?.projectNumber,
    name:          str(d.name),
    templateId:    str(d.templateId),
    variantId:     d.variantId ? str(d.variantId) : undefined,
    groupBy:       str(d.groupBy, 'discipline'),
    filters:       parseFilters(d.filters),
    bodyText:      str(d.bodyText),
    modelLink:     d.modelLink ? str(d.modelLink) : undefined,
    recipients:    strList(d.recipients),
    deliveryMode:  d.deliveryMode === 'draft' ? 'draft' : 'send',
    frequency:     parseFrequency(d.frequency),
    timezone:      str(d.timezone, DEFAULT_TZ),
    active:        d.active !== false,
    ownerUserId:   str(d.ownerUserId),
    ownerName:     d.ownerName ? str(d.ownerName) : undefined,
    nextRunAt:     iso(d.nextRunAt) ?? new Date().toISOString(),
    lastRunAt:     iso(d.lastRunAt),
    lastStatus:    d.lastStatus as ScheduleDTO['lastStatus'],
    lastError:     d.lastError ? str(d.lastError) : undefined,
    runCount:      Number(d.runCount ?? 0),
    history: history.slice(-5).reverse().map(h => ({
      at:         iso(h.at) ?? '',
      status:     h.status as ScheduleDTO['lastStatus'] ?? 'failed',
      error:      h.error ? str(h.error) : undefined,
      reportId:   h.reportId ? String(h.reportId) : undefined,
      issueCount: h.issueCount != null ? Number(h.issueCount) : undefined,
      recipients: h.recipients != null ? Number(h.recipients) : undefined,
    })),
  }
}
