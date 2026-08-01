// Timezone-aware next-run computation for report schedules.
//
// Schedules are authored in wall-clock time for a timezone (Israel by default),
// but stored/compared in UTC so the cron can query "everything due now" with a
// plain index scan. Everything here is dependency-free: Intl gives us the zone's
// offset at any instant, which is all that's needed to convert both ways.

export const DEFAULT_TZ = 'Asia/Jerusalem'

export type FrequencyKind = 'daily' | 'weekly' | 'monthly'

export interface Frequency {
  kind: FrequencyKind
  weekday?: number     // 0=Sunday … 6=Saturday — weekly only
  dayOfMonth?: number  // 1–31 (clamped to the month's length) — monthly only
  hour: number         // 0–23, wall clock in `timezone`
  minute: number       // 0–59
}

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

// The zone's wall-clock reading of an instant, as plain numbers.
export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0)
  // Intl renders midnight as "24" in some ICU versions — normalise it to 0.
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour') % 24, minute: get('minute'), second: get('second'),
  }
}

// Offset of `tz` from UTC at a given instant, in milliseconds (positive = ahead).
function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()
}

// Wall clock in `tz` → the UTC instant it refers to. Two passes settle the
// chicken-and-egg of "which offset applies?" across a DST boundary.
export function zonedTimeToUtc(
  y: number, m: number, d: number, hour: number, minute: number, tz: string,
): Date {
  const naive = Date.UTC(y, m - 1, d, hour, minute, 0)
  let ts = naive - tzOffsetMs(new Date(naive), tz)
  ts = naive - tzOffsetMs(new Date(ts), tz)
  return new Date(ts)
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

// The next instant strictly after `from` that matches the frequency.
// Scans day by day in the schedule's own timezone (max ~14 months), so DST
// shifts and short months resolve naturally rather than by arithmetic.
export function computeNextRun(freq: Frequency, tz: string = DEFAULT_TZ, from: Date = new Date()): Date {
  const start = zonedParts(from, tz)
  const hour = Math.min(23, Math.max(0, Math.round(freq.hour ?? 0)))
  const minute = Math.min(59, Math.max(0, Math.round(freq.minute ?? 0)))

  for (let offset = 0; offset < 400; offset++) {
    // Walk calendar days in the zone by stepping a UTC-noon anchor (noon keeps
    // the date stable regardless of the zone's offset).
    const anchor = new Date(Date.UTC(start.year, start.month - 1, start.day + offset, 12))
    const y = anchor.getUTCFullYear()
    const m = anchor.getUTCMonth() + 1
    const d = anchor.getUTCDate()

    if (freq.kind === 'weekly') {
      const want = ((freq.weekday ?? 0) % 7 + 7) % 7
      if (anchor.getUTCDay() !== want) continue
    } else if (freq.kind === 'monthly') {
      const want = Math.min(Math.max(1, Math.round(freq.dayOfMonth ?? 1)), daysInMonth(y, m))
      if (d !== want) continue
    }

    const candidate = zonedTimeToUtc(y, m, d, hour, minute, tz)
    if (candidate.getTime() > from.getTime()) return candidate
  }

  // Unreachable for valid input; keeps the return type honest.
  return new Date(from.getTime() + 86_400_000)
}

// ── Display helpers ─────────────────────────────────────────────────────────

const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const hhmm = (f: Frequency) =>
  `${String(f.hour).padStart(2, '0')}:${String(f.minute).padStart(2, '0')}`

// Short human cadence, e.g. "Weekly · Sunday 09:00".
export function describeFrequency(f: Frequency): string {
  if (f.kind === 'daily')  return `Daily · ${hhmm(f)}`
  if (f.kind === 'weekly') return `Weekly · ${WEEKDAYS_EN[((f.weekday ?? 0) % 7 + 7) % 7]} ${hhmm(f)}`
  return `Monthly · day ${Math.min(Math.max(1, f.dayOfMonth ?? 1), 31)} · ${hhmm(f)}`
}

export function describeFrequencyHe(f: Frequency): string {
  if (f.kind === 'daily')  return `כל יום · ${hhmm(f)}`
  if (f.kind === 'weekly') return `כל יום ${WEEKDAYS_HE[((f.weekday ?? 0) % 7 + 7) % 7]} · ${hhmm(f)}`
  return `כל ${Math.min(Math.max(1, f.dayOfMonth ?? 1), 31)} בחודש · ${hhmm(f)}`
}

// Compact date+time in the schedule's zone, for the management tables.
export function formatInZone(iso: string | Date | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
