// Backfill: import every historical Monday timesheet row into TimeEntry.
//
// Idempotent delete-and-rewrite: all docs with source:'monday' are replaced on
// each run, portal-native docs (manual/calendar/...) are never touched — a slot
// already occupied by a portal doc wins and the Monday slot is reported.
// Safe to re-run weekly during the transition window to sweep late Monday edits.
//
//   cd apps/epm && npx tsx --env-file=.env.local scripts/backfillTimeEntriesFromMonday.ts --dry-run
//   cd apps/epm && npx tsx --env-file=.env.local scripts/backfillTimeEntriesFromMonday.ts
//
// IMPORTANT for the production run: .env.local carries the Clerk DEV key
// (sk_test_, ~3 users). Export the LIVE CLERK_SECRET_KEY (from Vercel) so
// current employees map to their real Clerk ids instead of ext:<email>
// fallbacks. Re-running with the right key self-heals earlier ext: imports.
//
// Column ids discovered by scripts/inspectTimesheetBoards.ts (2026-08-24):
//   board_relation_mkqd3xgf  link to MA-003 project item
//   date4                    date ('YYYY-MM-DD')
//   numeric                  hours (ש"ע)
//   label__1                 Subject   (Model MGMT / Superposition / Modelling / EasyBIM)
//   color__1                 Subtopic  ("1. Meeting", "4. MEP Coord", ...)
//   people                   Employee
//   dropdown__1              "OLD Project" — legacy rows with a name label instead of a relation
//   dropdown_mkz3tdn3        "TRANSFER COL" — Hebrew project names (parallel legacy labels)
//   text_mkkrwzwy            Comments → note
import mongoose, { Types } from 'mongoose'
import { createClerkClient } from '@clerk/backend'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import TimeEntry from '../app/models/TimeEntry'
import Project from '../app/models/Project'

const DRY_RUN = process.argv.includes('--dry-run')
const MONDAY_API_URL = 'https://api.monday.com/v2'

// 'standard' boards share the TS-001 column layout (board_relation + Subject/
// Subtopic status columns). TS-002 (InteriorBIM, workspace "01. Interior BIM
// MGMT") has its own layout: the project is a CLIENT CODE dropdown (DBA, NHR,
// LBL, ...) with no EPM project behind it — those rows import under synthetic
// keys 'interior:<CODE>' so the hours stay attributed per client and per person.
const BOARDS: Array<{ id: string; label: string; kind: 'standard' | 'interior'; internalDefault: boolean }> = [
  { id: '6802118492',  label: 'TS-001 Projects',           kind: 'standard', internalDefault: false },
  { id: '8103706724',  label: 'TS-002 InteriorBIM',        kind: 'interior', internalDefault: true  },
  { id: '18396186789', label: 'TS-003 EasyBIM',            kind: 'standard', internalDefault: true  }, // EasyBIM internal timesheet
  { id: '18393331343', label: 'TS-004 Completed Projects', kind: 'standard', internalDefault: false },
  { id: '18411540568', label: 'TS-005 Medical Projects',   kind: 'standard', internalDefault: false },
]

const STANDARD_COL_IDS = [
  'board_relation_mkqd3xgf', 'date4', 'numeric', 'label__1', 'color__1',
  'people', 'dropdown__1', 'dropdown_mkz3tdn3', 'text_mkkrwzwy',
]
// TS-002: dropdown__1 = client code (פרויקט), status0 = Subject (נושא),
// status_1 = Subtopic (תת נושא), people = the EasyBIM employee.
const INTERIOR_COL_IDS = ['dropdown__1', 'date4', 'numeric', 'status0', 'status_1', 'people']

// Stray MA-003 items manually mapped to an EPM project number (user decisions).
// 8874964834 "פרויקט שפדן" → 22120 "לודן צפון - ליווי BIM משרדי" (2026-08-24).
const STRAY_MA003_TO_PROJECT_NUMBER: Record<string, string> = {
  '8874964834': '22120',
}

// TS-002 client codes → EPM "ליווי BIM משרדי" project numbers (user-confirmed
// 2026-08-24). Codes NOT listed here (AFK, WV, MES) deliberately stay as
// synthetic interior:<code> keys until the user assigns them a project.
const INTERIOR_CODE_TO_PROJECT_NUMBER: Record<string, string> = {
  DBA: '22101', // בר עקיבא
  LDN: '22120', // לודן צפון
  LBL: '22132', // לבל
  SNT: '22139', // סניט
  NHR: '22158', // הררי
  BAR: '22162', // קבוצת בראל
}

// Subject labels on the boards are already clean; EasyBIM maps to the portal's
// internal subject. Blank falls back to 'General' (same as the live breakdown).
const SUBJECT_MAP: Record<string, string> = {
  'Model MGMT':    'Model MGMT',
  'Superposition': 'Superposition',
  'Modelling':     'Modelling',
  'EasyBIM':       'EasyBIM Internal',
}
const SUBJECT_FALLBACK = 'General'

// Subtopics: strip the "N. " ordering prefix, then map the labels that have an
// exact portal-taxonomy equivalent; everything else is kept verbatim (the UI
// tolerates unknown subtopics).
const SUBTOPIC_MAP: Record<string, string> = {
  'Meeting':  'Meetings',
  'Training': 'Training',
  'R&D':      'R&D',
  'Management': 'Management',
}

// Legacy dropdown labels that are internal work, not projects.
const INTERNAL_LABELS = new Set(['easybim', '1. self/group training', '5. other', 'meeting'])

// MA-003 items that represent internal EasyBIM work, not client projects
// (looked up by id 2026-08-24: "EasyBIM - איזיבים", "1. Self/Group Training", "5. Other").
const INTERNAL_MA003_IDS = new Set(['9013469148', '9013383334', '9013463951'])

// ── Monday helpers ──────────────────────────────────────────────────────────

async function mondayQuery(query: string, variables?: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN
  if (!token) throw new Error('MONDAY_API_TOKEN is not set')
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token, 'API-Version': '2024-10' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`)
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data
}

interface RawRow {
  boardId: string
  boardLabel: string
  kind: 'standard' | 'interior'
  itemId: string
  ma003ItemId: string | null
  date: string            // '' when undated
  hours: number
  subjectRaw: string
  subtopicRaw: string
  personIds: string[]
  personText: string
  dropdownLabel: string   // standard: dropdown__1 else dropdown_mkz3tdn3; interior: client code
  note: string
}

async function fetchBoardRows(board: { id: string; label: string; kind: 'standard' | 'interior' }): Promise<RawRow[]> {
  const query = `
    query ($boardId: ID!, $cursor: String, $colIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 500, cursor: $cursor) {
          cursor
          items {
            id
            column_values(ids: $colIds) {
              id
              text
              value
              ... on BoardRelationValue { linked_item_ids }
            }
          }
        }
      }
    }
  `
  const interior = board.kind === 'interior'
  const rows: RawRow[] = []
  let cursor: string | null = null
  do {
    const data = await mondayQuery(query, { boardId: board.id, cursor, colIds: interior ? INTERIOR_COL_IDS : STANDARD_COL_IDS }) as {
      boards: Array<{ items_page: { cursor: string | null; items: Array<{ id: string; column_values: Array<{ id: string; text: string | null; value: string | null; linked_item_ids?: string[] }> }> } }>
    }
    const page = data.boards[0]?.items_page
    cursor = page?.cursor ?? null
    for (const item of page?.items ?? []) {
      const col = Object.fromEntries(item.column_values.map(c => [c.id, c]))
      let personIds: string[] = []
      try {
        const parsed = JSON.parse(col['people']?.value ?? 'null')?.personsAndTeams ?? []
        personIds = parsed.filter((p: { kind?: string }) => p.kind !== 'team').map((p: { id: number | string }) => String(p.id))
      } catch {}
      rows.push({
        boardId: board.id,
        boardLabel: board.label,
        kind: board.kind,
        itemId: item.id,
        ma003ItemId: interior ? null : col['board_relation_mkqd3xgf']?.linked_item_ids?.[0] ?? null,
        date: (col['date4']?.text ?? '').trim(),
        hours: parseFloat(col['numeric']?.text ?? '0') || 0,
        subjectRaw: (col[interior ? 'status0' : 'label__1']?.text ?? '').trim(),
        subtopicRaw: (col[interior ? 'status_1' : 'color__1']?.text ?? '').trim(),
        personIds,
        personText: (col['people']?.text ?? '').trim(),
        dropdownLabel: interior
          ? (col['dropdown__1']?.text ?? '').trim()
          : (col['dropdown__1']?.text ?? '').trim() || (col['dropdown_mkz3tdn3']?.text ?? '').trim(),
        note: interior ? '' : (col['text_mkkrwzwy']?.text ?? '').trim(),
      })
    }
  } while (cursor)
  return rows
}

async function fetchItemNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    const data = await mondayQuery(
      `query ($ids: [ID!]!) { items(ids: $ids) { id name } }`,
      { ids: ids.slice(i, i + BATCH) },
    ) as { items: Array<{ id: string; name: string }> }
    for (const it of data.items ?? []) map.set(String(it.id), it.name)
  }
  return map
}

async function fetchMondayUserEmails(ids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const map = new Map<string, { name: string; email: string }>()
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    const data = await mondayQuery(
      `query ($ids: [ID!]!) { users(ids: $ids) { id name email } }`,
      { ids: ids.slice(i, i + BATCH) },
    ) as { users: Array<{ id: string; name: string; email: string | null }> }
    for (const u of data.users ?? []) map.set(String(u.id), { name: u.name, email: (u.email ?? '').toLowerCase() })
  }
  return map
}

// ── Normalization ───────────────────────────────────────────────────────────

function mapSubject(raw: string, report: Report): string {
  if (!raw) return SUBJECT_FALLBACK
  const mapped = SUBJECT_MAP[raw]
  if (mapped) return mapped
  report.unknownSubjects[raw] = (report.unknownSubjects[raw] ?? 0) + 1
  return raw
}

function mapSubtopic(raw: string): string {
  if (!raw) return ''
  const stripped = raw.replace(/^\d+\.\s*/, '').trim()
  return SUBTOPIC_MAP[stripped] ?? stripped
}

const normalizeName = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// ── Report ──────────────────────────────────────────────────────────────────

interface Report {
  runAt: string
  dryRun: boolean
  perBoard: Record<string, { rows: number; imported: number; hoursImported: number; skippedUndated: number; undatedHours: number; skippedZeroHours: number }>
  unknownSubjects: Record<string, number>
  nonTaxonomySubtopics: Record<string, number>
  unmatchedMa003: Record<string, { rows: number; hours: number }>
  sharedMa003: Record<string, string[]>
  unmatchedLabels: Record<string, { rows: number; hours: number; sample: string[] }>
  ambiguousLabels: Record<string, { candidates: string[]; rows: number; hours: number }>
  labelMatches: Record<string, string>
  internalLabelRows: Record<string, { rows: number; hours: number }>
  unresolvedProjectRows: Array<{ board: string; itemId: string; date: string; hours: number; person: string }>
  peopleWithoutEmail: Record<string, { rows: number; hours: number }>
  extUsers: Record<string, string>          // ext:<email> → display name
  multiPersonRows: number
  over24Slots: Array<{ userName: string; projectName: string; date: string; subject: string; subtopic: string; hours: number }>
  collisionsPortalWon: Array<{ userName: string; projectName: string; date: string; subject: string; subtopic: string; hours: number }>
  totals: { rows: number; slots: number; hoursImported: number }
}

// ── Main ────────────────────────────────────────────────────────────────────

const TAXONOMY_SUBTOPICS = new Set(['Meetings', 'ProjectWork', 'Training', 'R&D', 'Social', 'Management', ''])

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  await mongoose.connect(uri)
  console.log(`Connected to Mongo (${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE'})`)

  const report: Report = {
    runAt: new Date().toISOString(), dryRun: DRY_RUN,
    perBoard: {}, unknownSubjects: {}, nonTaxonomySubtopics: {}, unmatchedMa003: {}, sharedMa003: {},
    unmatchedLabels: {}, ambiguousLabels: {}, labelMatches: {}, internalLabelRows: {},
    unresolvedProjectRows: [], peopleWithoutEmail: {}, extUsers: {}, multiPersonRows: 0,
    over24Slots: [], collisionsPortalWon: [],
    totals: { rows: 0, slots: 0, hoursImported: 0 },
  }

  // 1. Sweep all boards.
  console.log('Sweeping Monday timesheet boards...')
  const allRows: RawRow[] = []
  for (const board of BOARDS) {
    const rows = await fetchBoardRows(board)
    allRows.push(...rows)
    console.log(`  ${board.label}: ${rows.length} rows`)
  }
  report.totals.rows = allRows.length

  // 2. People map: Monday person id → email/name → Clerk id or ext:<email>.
  console.log('Resolving people (Monday → Clerk)...')
  const personIds = [...new Set(allRows.flatMap(r => r.personIds))]
  const mondayUsers = await fetchMondayUserEmails(personIds)

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
  const clerkByEmail = new Map<string, { id: string; name: string }>()
  {
    let offset = 0
    for (;;) {
      const { data } = await clerk.users.getUserList({ limit: 500, offset })
      for (const u of data) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ')
        for (const e of u.emailAddresses) clerkByEmail.set(e.emailAddress.toLowerCase(), { id: u.id, name })
      }
      if (data.length < 500) break
      offset += 500
    }
  }
  console.log(`  ${personIds.length} Monday people, ${clerkByEmail.size} Clerk emails`)

  // person id → { userId, userName }
  const personMap = new Map<string, { userId: string; userName: string }>()
  for (const pid of personIds) {
    const mu = mondayUsers.get(pid)
    if (!mu) { personMap.set(pid, { userId: 'ext:unknown', userName: 'Unassigned' }); continue }
    const clerkUser = mu.email ? clerkByEmail.get(mu.email) : undefined
    if (clerkUser) {
      personMap.set(pid, { userId: clerkUser.id, userName: clerkUser.name || mu.name })
    } else if (mu.email) {
      personMap.set(pid, { userId: `ext:${mu.email}`, userName: mu.name })
      report.extUsers[`ext:${mu.email}`] = mu.name
    } else {
      personMap.set(pid, { userId: 'ext:unknown', userName: mu.name || 'Unassigned' })
    }
  }

  // 3. Project map.
  const projects = await Project.find({}, { projectName: 1, projectNumber: 1, 'externalIds.ma003ItemId': 1 }).lean() as unknown as Array<{
    _id: Types.ObjectId; projectName: string; projectNumber: string; externalIds?: { ma003ItemId?: string }
  }>
  const byMa003 = new Map<string, typeof projects[number]>()
  for (const p of projects) {
    const id = p.externalIds?.ma003ItemId
    if (!id) continue
    const prev = byMa003.get(id)
    if (prev) {
      // Two EPM projects point at the same MA-003 item (e.g. 22184/22196
      // "מבנה אינטגרציה") — the hours can only be attributed to one of them.
      report.sharedMa003[id] = [prev, p].map(x => `${x.projectNumber} ${x.projectName}`)
      console.log(`  WARNING: projects ${prev.projectNumber} and ${p.projectNumber} share MA-003 ${id} — hours go to ${p.projectNumber}`)
    }
    byMa003.set(id, p)
  }
  const byNumber = new Map(projects.map(p => [p.projectNumber, p]))
  const byNormName = projects.map(p => ({ p, norm: normalizeName(p.projectName) }))

  const labelCache = new Map<string, { key: string; id: Types.ObjectId | null; name: string } | 'unmatched' | 'ambiguous'>()
  function resolveLabel(label: string) {
    const cached = labelCache.get(label)
    if (cached) return cached
    let result: { key: string; id: Types.ObjectId | null; name: string } | 'unmatched' | 'ambiguous'
    const num = label.match(/\b(\d{4,5})\b/)?.[1]
    const numHit = num ? byNumber.get(num) : undefined
    if (numHit) {
      result = { key: String(numHit._id), id: numHit._id, name: numHit.projectName }
    } else {
      const norm = normalizeName(label)
      const exact = byNormName.filter(x => x.norm === norm)
      const partial = exact.length ? exact : byNormName.filter(x =>
        norm.length >= 4 && (x.norm.includes(norm) || norm.includes(x.norm)))
      if (partial.length === 1) {
        const p = partial[0].p
        result = { key: String(p._id), id: p._id, name: p.projectName }
      } else if (partial.length > 1) {
        result = 'ambiguous'
        report.ambiguousLabels[label] = { candidates: partial.map(x => x.p.projectName), rows: 0, hours: 0 }
      } else {
        result = 'unmatched'
      }
    }
    if (typeof result === 'object') report.labelMatches[label] = result.name
    labelCache.set(label, result)
    return result
  }

  // 3b. Unknown MA-003 ids: internal buckets map to 'internal'; anything else is
  // looked up by item name and matched against project names (e.g. completed
  // projects whose MA-003 item exists but has no EPM Project doc yet).
  const strayMa003 = [...new Set(allRows.map(r => r.ma003ItemId).filter((id): id is string =>
    !!id && !byMa003.has(id) && !INTERNAL_MA003_IDS.has(id)))]
  const ma003NameResolution = new Map<string, { key: string; id: Types.ObjectId | null; name: string } | null>()
  if (strayMa003.length) {
    const names = await fetchItemNames(strayMa003)
    for (const id of strayMa003) {
      const name = names.get(id)
      // Manual override first (user-decided mappings), then name matching.
      const overrideNum = STRAY_MA003_TO_PROJECT_NUMBER[id]
      const override = overrideNum ? byNumber.get(overrideNum) : undefined
      const hit = override
        ? { key: String(override._id), id: override._id, name: override.projectName }
        : name ? resolveLabel(name.replace(/^פרויקט\s+/, '')) : 'unmatched'
      ma003NameResolution.set(id, typeof hit === 'object' ? hit : null)
      if (typeof hit !== 'object') console.log(`  stray MA-003 ${id} ("${name ?? '?'}") — no matching EPM project`)
      else console.log(`  stray MA-003 ${id} ("${name}") → ${override ? 'OVERRIDE' : 'matched'} project "${hit.name}"`)
    }
  }

  // 4. Fold rows into slots.
  interface Slot {
    userId: string; userName: string; date: string; projectKey: string
    projectId: Types.ObjectId | null; projectName: string
    subject: string; subtopic: string; hours: number; mondayItemIds: string[]; notes: string[]
  }
  const slots = new Map<string, Slot>()

  for (const row of allRows) {
    const stats = report.perBoard[row.boardLabel] ??= { rows: 0, imported: 0, hoursImported: 0, skippedUndated: 0, undatedHours: 0, skippedZeroHours: 0 }
    stats.rows++

    if (!row.hours) { stats.skippedZeroHours++; continue }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) { stats.skippedUndated++; stats.undatedHours += row.hours; continue }

    // Project resolution: relation → dropdown label → board default.
    // Interior rows: the dropdown is a client code, not an EPM project — keep it
    // as a synthetic key so per-client attribution survives the migration.
    let projectKey: string, projectId: Types.ObjectId | null = null, projectName: string
    if (row.kind === 'interior') {
      const code = row.dropdownLabel.split(',')[0]?.trim() ?? ''
      const mappedNum = INTERIOR_CODE_TO_PROJECT_NUMBER[code]
      const mapped = mappedNum ? byNumber.get(mappedNum) : undefined
      if (mapped) {
        projectKey = String(mapped._id); projectId = mapped._id; projectName = mapped.projectName
      } else if (!code || code.toLowerCase() === 'easybim') {
        projectKey = 'internal'; projectName = 'EasyBIM Internal'
      } else {
        projectKey = `interior:${code}`; projectName = `InteriorBIM — ${code}`
      }
    } else if (row.ma003ItemId && INTERNAL_MA003_IDS.has(row.ma003ItemId)) {
      projectKey = 'internal'; projectName = 'EasyBIM Internal'
    } else if (row.ma003ItemId) {
      const p = byMa003.get(row.ma003ItemId)
      const nameHit = p ? null : ma003NameResolution.get(row.ma003ItemId)
      if (p) {
        projectKey = String(p._id); projectId = p._id; projectName = p.projectName
      } else if (nameHit) {
        projectKey = nameHit.key; projectId = nameHit.id; projectName = nameHit.name
      } else {
        const b = report.unmatchedMa003[row.ma003ItemId] ??= { rows: 0, hours: 0 }
        b.rows++; b.hours += row.hours
        continue
      }
    } else if (row.dropdownLabel && !INTERNAL_LABELS.has(row.dropdownLabel.toLowerCase())) {
      const hit = resolveLabel(row.dropdownLabel)
      if (hit === 'unmatched') {
        const b = report.unmatchedLabels[row.dropdownLabel] ??= { rows: 0, hours: 0, sample: [] }
        b.rows++; b.hours += row.hours
        if (b.sample.length < 3) b.sample.push(row.itemId)
        continue
      }
      if (hit === 'ambiguous') {
        const b = report.ambiguousLabels[row.dropdownLabel]
        b.rows++; b.hours += row.hours
        continue
      }
      projectKey = hit.key; projectId = hit.id; projectName = hit.name
    } else if (row.dropdownLabel) {
      const b = report.internalLabelRows[row.dropdownLabel] ??= { rows: 0, hours: 0 }
      b.rows++; b.hours += row.hours
      projectKey = 'internal'; projectName = 'EasyBIM Internal'
    } else if (BOARDS.find(b => b.id === row.boardId)?.internalDefault) {
      projectKey = 'internal'; projectName = 'EasyBIM Internal'
    } else {
      report.unresolvedProjectRows.push({ board: row.boardLabel, itemId: row.itemId, date: row.date, hours: row.hours, person: row.personText })
      continue
    }

    // Person resolution.
    if (row.personIds.length > 1) report.multiPersonRows++
    const person = row.personIds.length
      ? personMap.get(row.personIds[0])!
      : { userId: 'ext:unknown', userName: row.personText || 'Unassigned' }
    if (person.userId === 'ext:unknown') {
      const b = report.peopleWithoutEmail[person.userName] ??= { rows: 0, hours: 0 }
      b.rows++; b.hours += row.hours
    }

    // Interior subjects are the board's own Hebrew taxonomy — keep them verbatim
    // (prefix-stripped) instead of reporting each one as unknown.
    const subject = row.kind === 'interior'
      ? (row.subjectRaw.replace(/^\d+\.\s*/, '').trim() || SUBJECT_FALLBACK)
      : mapSubject(row.subjectRaw, report)
    const subtopic = mapSubtopic(row.subtopicRaw)
    if (row.kind !== 'interior' && !TAXONOMY_SUBTOPICS.has(subtopic)) report.nonTaxonomySubtopics[subtopic] = (report.nonTaxonomySubtopics[subtopic] ?? 0) + 1

    const key = [person.userId, projectKey, row.date, subject, subtopic].join('|')
    const slot = slots.get(key) ?? {
      userId: person.userId, userName: person.userName, date: row.date,
      projectKey, projectId, projectName, subject, subtopic,
      hours: 0, mondayItemIds: [], notes: [],
    }
    slot.hours += row.hours
    slot.mondayItemIds.push(row.itemId)
    if (row.note && !slot.notes.includes(row.note)) slot.notes.push(row.note)
    slots.set(key, slot)

    stats.imported++; stats.hoursImported += row.hours
    report.totals.hoursImported += row.hours
  }
  report.totals.slots = slots.size

  for (const s of slots.values()) {
    if (s.hours > 24) report.over24Slots.push({ userName: s.userName, projectName: s.projectName, date: s.date, subject: s.subject, subtopic: s.subtopic, hours: s.hours })
  }

  // 5. Write: delete-and-rewrite all source:'monday' docs.
  const now = new Date()
  const docs = [...slots.values()].map(s => ({
    userId: s.userId,
    userName: s.userName,
    date: s.date,
    projectKey: s.projectKey,
    ...(s.projectId ? { projectId: s.projectId } : {}),
    projectName: s.projectName,
    hours: Math.round(s.hours * 100) / 100,
    subject: s.subject,
    subtopic: s.subtopic,
    ...(s.notes.length ? { note: s.notes.join(' | ').slice(0, 500) } : {}),
    source: 'monday' as const,
    mondayItemIds: s.mondayItemIds,
    createdAt: now,
    updatedAt: now,
  }))

  if (!DRY_RUN) {
    const del = await TimeEntry.deleteMany({ source: 'monday' })
    console.log(`Deleted ${del.deletedCount} existing source:'monday' docs`)
    try {
      // Native insertMany: skips the 0-24 hours validator for aggregated legacy slots.
      const res = await TimeEntry.collection.insertMany(docs as unknown as Parameters<typeof TimeEntry.collection.insertMany>[0], { ordered: false })
      console.log(`Inserted ${res.insertedCount} docs`)
    } catch (e) {
      const err = e as { code?: number; result?: { insertedCount?: number }; writeErrors?: Array<{ err?: { op?: Record<string, unknown> } }> }
      const inserted = err.result?.insertedCount ?? 0
      const collisions = err.writeErrors ?? []
      console.log(`Inserted ${inserted} docs; ${collisions.length} slot(s) already held by portal entries (portal wins)`)
      for (const w of collisions) {
        const op = (w.err?.op ?? {}) as { userName?: string; projectName?: string; date?: string; subject?: string; subtopic?: string; hours?: number }
        report.collisionsPortalWon.push({
          userName: op.userName ?? '', projectName: op.projectName ?? '', date: op.date ?? '',
          subject: op.subject ?? '', subtopic: op.subtopic ?? '', hours: op.hours ?? 0,
        })
      }
      if (err.code !== undefined && err.code !== 11000 && !collisions.length) throw e
    }
  } else {
    console.log(`DRY RUN: would delete existing source:'monday' docs and insert ${docs.length} slots`)
  }

  // 6. Report.
  const round = (n: number) => Math.round(n * 100) / 100
  console.log('\n── Summary ──')
  for (const [label, s] of Object.entries(report.perBoard))
    console.log(`  ${label}: ${s.rows} rows → ${s.imported} imported (${round(s.hoursImported)}h) | undated ${s.skippedUndated} (${round(s.undatedHours)}h) | zero-hours ${s.skippedZeroHours}`)
  console.log(`  Slots: ${report.totals.slots}, total hours imported: ${round(report.totals.hoursImported)}`)
  console.log(`  Ext (no portal account) users: ${Object.keys(report.extUsers).length}`)
  console.log(`  Unmatched labels: ${Object.keys(report.unmatchedLabels).length}, ambiguous: ${Object.keys(report.ambiguousLabels).length}, unmatched MA-003 ids: ${Object.keys(report.unmatchedMa003).length}`)
  console.log(`  Unresolved-project rows: ${report.unresolvedProjectRows.length}, multi-person rows: ${report.multiPersonRows}, >24h slots: ${report.over24Slots.length}`)

  const outDir = path.join(__dirname, 'tmp')
  mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `backfill-report-${report.runAt.slice(0, 10)}${DRY_RUN ? '-dry' : ''}.json`)
  writeFileSync(outFile, JSON.stringify(report, null, 2))
  console.log(`\nFull report: ${outFile}`)

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
