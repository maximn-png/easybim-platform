// Monday.com GraphQL API v2 service.
// Requires MONDAY_API_TOKEN env var. Not called until token is set.
// Used by the /api/sync/projects route for automated background sync.

const MONDAY_API_URL = 'https://api.monday.com/v2'

const MA004_BOARD_ID = '7321609006'

// MI-001-MilestonesProjects: each item is a milestone (belonging to one discipline
// via color_mm06m73n) linked to its MA-004 project via board_relation_mkywzj9x. Each
// milestone's subitems are "bills" (חשבונות) whose submission status (color_mkyk8mbx)
// tells us whether the bill is done.
const MILESTONES_BOARD_ID = '18393427964'

// TS-001/003/004/005 share identical column structure (board_relation_mkqd3xgf + numeric).
// TS-002 (InteriorBIM) uses a dropdown instead of board_relation — cannot be mapped to MA-003 IDs.
const TIMESHEET_BOARD_IDS = [
  '6802118492',   // TS-001 — Projects Timesheet
  '18396186789',  // TS-003 — EasyBIM Timesheet
  '18393331343',  // TS-004 — Completed Projects Timesheet
  '18411540568',  // TS-005 — Medical Projects Timesheet
]

// Status index mapping from MA-004 board
const STATUS_MAP: Record<number, 'Working on it' | 'On Hold' | 'Not Started' | 'Stuck'> = {
  0: 'Working on it',
  4: 'On Hold',
  3: 'Not Started',
  2: 'Stuck',
}
const DONE_STATUS_IDS = new Set([1, 9]) // "Finished", "DONE" → mapped to 'Done'

// ── GraphQL helper ─────────────────────────────────────────────────────────

async function mondayQuery(query: string, variables?: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN
  if (!token) throw new Error('MONDAY_API_TOKEN is not set')

  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': token,
      'API-Version':   '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`)
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface MA004Project {
  itemId:        string
  projectName:   string
  projectNumber: string
  status:        'Working on it' | 'On Hold' | 'Not Started' | 'Stuck' | 'Done' | null
  budgetHours:   number | null   // formula8 = fee ÷ 300
  ma003ItemIds:  string[]        // linked MA-003 item IDs
}

export interface MA003Project {
  itemId:         string
  bimManager?:    { name: string; mondayId: string }
  mepCoordinator?: { name: string; mondayId: string }
  bimModeller?:   { name: string; mondayId: string }
  accUrl?:        string
  mainBoardUrl?:  string
  client?:        string   // "Client" text column (text_mkpswt15)
}

export interface TS001HoursSummary {
  actualHours: number
}

// ── MA-004: All projects ───────────────────────────────────────────────────
// Done/Finished items are included with status 'Done' so the sync can update
// their stored status (otherwise a project finished in Monday would keep its
// last active status in EPM forever). Callers filter them out of the heavy
// per-project work.

export async function fetchActiveMA004Projects(): Promise<MA004Project[]> {
  const query = `
    query ($boardId: ID!, $limit: Int!, $cursor: String) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, cursor: $cursor) {
          cursor
          items {
            id
            name
            column_values(ids: ["text__1", "status", "formula8", "board_relation_mkyt6111"]) {
              id
              value
              text
              ... on BoardRelationValue { linked_item_ids }
              ... on FormulaValue { display_value }
            }
          }
        }
      }
    }
  `

  const results: MA004Project[] = []
  let cursor: string | null = null

  do {
    const data = await mondayQuery(query, { boardId: MA004_BOARD_ID, limit: 100, cursor }) as {
      boards: Array<{ items_page: { cursor: string | null; items: Array<{ id: string; name: string; column_values: Array<{ id: string; value: string; text: string; linked_item_ids?: string[]; display_value?: string }> }> } }>
    }

    const items = data.boards[0]?.items_page?.items ?? []
    cursor = data.boards[0]?.items_page?.cursor ?? null

    for (const item of items) {
      const colMap = Object.fromEntries(item.column_values.map(c => [c.id, c]))

      // Parse status from value JSON (the only reliable approach)
      let statusIndex: number | null = null
      try { statusIndex = JSON.parse(colMap['status']?.value ?? 'null')?.index ?? null } catch {}
      const status = statusIndex === null
        ? null
        : DONE_STATUS_IDS.has(statusIndex) ? 'Done' as const : (STATUS_MAP[statusIndex] ?? null)

      // Parse budget hours (שכט סופי ÷ 300) from the formula column's computed
      // display_value — its `text` field comes back empty from the API.
      let budgetHours: number | null = null
      try { budgetHours = parseFloat(colMap['formula8']?.display_value ?? '') || null } catch {}

      // Parse MA-003 links via linked_item_ids (value field returns null for board_relation)
      const ma003ItemIds = (colMap['board_relation_mkyt6111']?.linked_item_ids ?? [])

      results.push({
        itemId:        item.id,
        projectName:   item.name,
        projectNumber: colMap['text__1']?.text?.trim() ?? '',
        status,
        budgetHours,
        ma003ItemIds,
      })
    }
  } while (cursor)

  return results
}

// ── MA-003: Team members + ACC link ───────────────────────────────────────

export async function fetchMA003ByItemIds(itemIds: string[]): Promise<Map<string, MA003Project>> {
  if (!itemIds.length) return new Map()

  const query = `
    query ($ids: [ID!]!) {
      items(ids: $ids) {
        id
        column_values(ids: ["multiple_person_mkpsmr4k", "multiple_person_mkpskxyf", "multiple_person_mm2tw6be", "link_mkpste", "link_mkqmrce0", "text_mkpswt15"]) {
          id
          value
          text
        }
      }
    }
  `

  const parsePerson = (value: string): { name: string; mondayId: string } | undefined => {
    try {
      const v = JSON.parse(value)
      const p = v?.personsAndTeams?.[0]
      if (!p) return undefined
      return { name: p.name ?? p.id?.toString() ?? '', mondayId: String(p.id) }
    } catch { return undefined }
  }

  const result = new Map<string, MA003Project>()
  // Monday's items(ids:) silently truncates the returned list for larger id sets
  // (the 4 person/link columns blow the per-query complexity budget), so keep the
  // batch small and retry any ids that didn't come back — otherwise ~30% of
  // projects lose their team + ACC link on a full sync.
  const BATCH = 25

  const fetchBatch = async (ids: string[]) => {
    const data = await mondayQuery(query, { ids }) as {
      items: Array<{ id: string; column_values: Array<{ id: string; value: string; text: string }> }>
    }
    for (const item of data.items ?? []) {
      const colMap = Object.fromEntries(item.column_values.map(c => [c.id, c]))

      let accUrl: string | undefined
      try {
        const linkVal = JSON.parse(colMap['link_mkpste']?.value ?? 'null')
        accUrl = linkVal?.url ?? undefined
      } catch {}

      let mainBoardUrl: string | undefined
      try {
        const linkVal = JSON.parse(colMap['link_mkqmrce0']?.value ?? 'null')
        mainBoardUrl = linkVal?.url ?? undefined
      } catch {}

      result.set(item.id, {
        itemId:          item.id,
        bimManager:      parsePerson(colMap['multiple_person_mkpsmr4k']?.value ?? ''),
        mepCoordinator:  parsePerson(colMap['multiple_person_mkpskxyf']?.value ?? ''),
        bimModeller:     parsePerson(colMap['multiple_person_mm2tw6be']?.value ?? ''),
        accUrl,
        mainBoardUrl,
        client:          colMap['text_mkpswt15']?.text?.trim() || undefined,
      })
    }
  }

  for (let i = 0; i < itemIds.length; i += BATCH) {
    await fetchBatch(itemIds.slice(i, i + BATCH))
  }

  // Retry any ids Monday dropped, individually. Genuinely deleted/inaccessible
  // items simply return nothing and are skipped.
  const missing = itemIds.filter(id => !result.has(id))
  for (const id of missing) {
    try { await fetchBatch([id]) } catch { /* skip unresolvable id */ }
  }

  return result
}

// ── User photos ───────────────────────────────────────────────────────────

export interface UserData { name: string; avatarUrl?: string }

export async function fetchUserPhotos(mondayIds: string[]): Promise<Map<string, UserData>> {
  if (!mondayIds.length) return new Map()

  const query = `
    query ($ids: [ID!]!) {
      users(ids: $ids) {
        id
        name
        photo_thumb_small
      }
    }
  `

  const map = new Map<string, UserData>()
  const BATCH = 100

  for (let i = 0; i < mondayIds.length; i += BATCH) {
    const batch = mondayIds.slice(i, i + BATCH)
    const data = await mondayQuery(query, { ids: batch }) as {
      users: Array<{ id: string; name: string; photo_thumb_small: string | null }>
    }
    for (const user of data.users ?? []) {
      map.set(String(user.id), {
        name: user.name,
        avatarUrl: user.photo_thumb_small ?? undefined,
      })
    }
  }

  return map
}

// ── Timesheet boards: Hours per project (bulk paginated) ──────────────────
// Queries TS-001, TS-003, TS-004, TS-005 in parallel and merges by MA-003 item ID.
// TS-002 (InteriorBIM) uses a dropdown instead of board_relation and is excluded.

async function fetchHoursForBoard(boardId: string): Promise<Map<string, number>> {
  // Use linked_item_ids inline fragment — the value field returns null for board_relation columns
  const query = `
    query ($boardId: ID!, $limit: Int!, $cursor: String) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, cursor: $cursor) {
          cursor
          items {
            column_values(ids: ["board_relation_mkqd3xgf", "numeric"]) {
              id
              text
              ... on BoardRelationValue { linked_item_ids }
            }
          }
        }
      }
    }
  `

  const hoursMap = new Map<string, number>()
  let cursor: string | null = null

  do {
    const data = await mondayQuery(query, { boardId, limit: 500, cursor }) as {
      boards: Array<{ items_page: { cursor: string | null; items: Array<{ column_values: Array<{ id: string; text: string; linked_item_ids?: string[] }> }> } }>
    }

    const items = data.boards[0]?.items_page?.items ?? []
    cursor = data.boards[0]?.items_page?.cursor ?? null

    for (const item of items) {
      const colMap = Object.fromEntries(item.column_values.map(c => [c.id, c]))

      const linkedIds = colMap['board_relation_mkqd3xgf']?.linked_item_ids ?? []
      const ma003ItemId = linkedIds[0] ?? null
      if (!ma003ItemId) continue

      const hours = parseFloat(colMap['numeric']?.text ?? '0') || 0
      hoursMap.set(ma003ItemId, (hoursMap.get(ma003ItemId) ?? 0) + hours)
    }
  } while (cursor)

  return hoursMap
}

export async function fetchAllTimesheetHours(): Promise<Map<string, TS001HoursSummary>> {
  const boardResults = await Promise.all(TIMESHEET_BOARD_IDS.map(fetchHoursForBoard))

  const merged = new Map<string, number>()
  for (const boardMap of boardResults) {
    for (const [id, hours] of boardMap) {
      merged.set(id, (merged.get(id) ?? 0) + hours)
    }
  }

  return new Map(
    Array.from(merged.entries()).map(([id, actual]) => [id, { actualHours: actual }])
  )
}

// ── Per-project monthly breakdown by Subject + Employee ────────────────────
// Powers the Hours Analytics page. Queries the timesheet boards filtered to a
// single project (via board_relation), and buckets each row by month, by the
// Subject (label__1) and by the Employee (people) columns in a single pass.

const SUBJECT_FALLBACK  = 'General'
const EMPLOYEE_FALLBACK = 'Unassigned'

export interface HoursBreakdown {
  months: {
    month:      string                   // 'YYYY-MM', ascending
    bySubject:  Record<string, number>
    byEmployee: Record<string, number>
    // subject → employee → hours, for filtering the employee chart by discipline
    bySubjectEmployee: Record<string, Record<string, number>>
  }[]
  subjects:         string[]             // distinct Subject labels, by total hours desc
  employees:        string[]             // distinct Employee names, by total hours desc
  totalsBySubject:  Record<string, number>
  totalsByEmployee: Record<string, number>
  employeeAvatars:  Record<string, string>  // employee name → avatar URL (when available)
}

interface RawEntry { month: string; subject: string; employee: string; employeeId: string | null; hours: number }

async function fetchProjectEntriesForBoard(boardId: string, ma003ItemId: string): Promise<RawEntry[]> {
  // query_params filters to this project; per Monday API it can only be sent on the
  // first request — subsequent pages are driven by the cursor alone.
  const query = `
    query ($boardId: ID!, $limit: Int!, $cursor: String, $queryParams: ItemsQuery) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, cursor: $cursor, query_params: $queryParams) {
          cursor
          items {
            column_values(ids: ["date4", "numeric", "label__1", "people"]) {
              id
              text
              value
            }
          }
        }
      }
    }
  `

  // board_relation filtering requires the linked item id as a NUMBER — a string yields zero matches.
  const queryParams = {
    rules: [{ column_id: 'board_relation_mkqd3xgf', compare_value: [Number(ma003ItemId)], operator: 'any_of' }],
  }

  const entries: RawEntry[] = []
  let cursor: string | null = null
  let first = true

  do {
    const variables = first
      ? { boardId, limit: 500, queryParams }
      : { boardId, limit: 500, cursor }

    const data = await mondayQuery(query, variables) as {
      boards: Array<{ items_page: { cursor: string | null; items: Array<{ column_values: Array<{ id: string; text: string; value: string }> }> } }>
    }

    const items = data.boards[0]?.items_page?.items ?? []
    cursor = data.boards[0]?.items_page?.cursor ?? null
    first = false

    for (const item of items) {
      const colMap = Object.fromEntries(item.column_values.map(c => [c.id, c]))

      const date = colMap['date4']?.text ?? ''           // 'YYYY-MM-DD' or ''
      if (date.length < 7) continue                       // skip rows with no date
      const month = date.slice(0, 7)                      // 'YYYY-MM'

      const hours = parseFloat(colMap['numeric']?.text ?? '0') || 0
      if (!hours) continue

      const subject  = (colMap['label__1']?.text ?? '').trim() || SUBJECT_FALLBACK
      const employee = (colMap['people']?.text ?? '').trim() || EMPLOYEE_FALLBACK

      // Pull the Monday person id from the people column value (for avatar lookup).
      let employeeId: string | null = null
      try {
        const pid = JSON.parse(colMap['people']?.value ?? 'null')?.personsAndTeams?.[0]?.id
        if (pid != null) employeeId = String(pid)
      } catch {}

      entries.push({ month, subject, employee, employeeId, hours })
    }
  } while (cursor)

  return entries
}

export async function fetchProjectHoursBreakdown(ma003ItemId: string): Promise<HoursBreakdown> {
  // A board that lacks the expected columns (or otherwise errors) is skipped, not fatal.
  const boardResults = await Promise.all(
    TIMESHEET_BOARD_IDS.map(async boardId => {
      try {
        return await fetchProjectEntriesForBoard(boardId, ma003ItemId)
      } catch (err) {
        console.error(`[fetchProjectHoursBreakdown] board ${boardId} skipped:`, err)
        return [] as RawEntry[]
      }
    })
  )

  const subjectByMonth  = new Map<string, Record<string, number>>()  // month → subject → hours
  const employeeByMonth = new Map<string, Record<string, number>>()  // month → employee → hours
  // month → subject → employee → hours (powers the per-discipline employee filter)
  const subjectEmployeeByMonth = new Map<string, Record<string, Record<string, number>>>()
  const totalsBySubject:  Record<string, number> = {}
  const totalsByEmployee: Record<string, number> = {}
  const employeeIdByName = new Map<string, string>()                 // employee name → Monday person id

  for (const entries of boardResults) {
    for (const { month, subject, employee, employeeId, hours } of entries) {
      const sBucket = subjectByMonth.get(month) ?? {}
      sBucket[subject] = (sBucket[subject] ?? 0) + hours
      subjectByMonth.set(month, sBucket)
      totalsBySubject[subject] = (totalsBySubject[subject] ?? 0) + hours

      const eBucket = employeeByMonth.get(month) ?? {}
      eBucket[employee] = (eBucket[employee] ?? 0) + hours
      employeeByMonth.set(month, eBucket)
      totalsByEmployee[employee] = (totalsByEmployee[employee] ?? 0) + hours

      const seBucket = subjectEmployeeByMonth.get(month) ?? {}
      const subMap = seBucket[subject] ?? {}
      subMap[employee] = (subMap[employee] ?? 0) + hours
      seBucket[subject] = subMap
      subjectEmployeeByMonth.set(month, seBucket)

      if (employeeId && !employeeIdByName.has(employee)) employeeIdByName.set(employee, employeeId)
    }
  }

  // Resolve avatars for the employees we have Monday person ids for.
  const employeeAvatars: Record<string, string> = {}
  try {
    const ids = Array.from(new Set(employeeIdByName.values()))
    if (ids.length) {
      const photos = await fetchUserPhotos(ids)
      for (const [name, id] of employeeIdByName) {
        const url = photos.get(id)?.avatarUrl
        if (url) employeeAvatars[name] = url
      }
    }
  } catch (err) {
    console.error('[fetchProjectHoursBreakdown] avatar lookup failed:', err)
  }

  const round = (n: number) => Math.round(n * 100) / 100
  const roundMap = (m: Record<string, number>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)]))
  const roundNested = (m: Record<string, Record<string, number>>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, roundMap(v)]))

  const allMonths = Array.from(new Set([...subjectByMonth.keys(), ...employeeByMonth.keys()])).sort()
  const months = allMonths.map(month => ({
    month,
    bySubject:         roundMap(subjectByMonth.get(month) ?? {}),
    byEmployee:        roundMap(employeeByMonth.get(month) ?? {}),
    bySubjectEmployee: roundNested(subjectEmployeeByMonth.get(month) ?? {}),
  }))

  const subjects  = Object.keys(totalsBySubject).sort((a, b) => totalsBySubject[b] - totalsBySubject[a])
  const employees = Object.keys(totalsByEmployee).sort((a, b) => totalsByEmployee[b] - totalsByEmployee[a])
  for (const s of subjects)  totalsBySubject[s]  = round(totalsBySubject[s])
  for (const e of employees) totalsByEmployee[e] = round(totalsByEmployee[e])

  return { months, subjects, employees, totalsBySubject, totalsByEmployee, employeeAvatars }
}

// ── Project banks (budgeted hours) from MA-004 ─────────────────────────────
// All values are price ÷ 300 (the divisor MA-004's formula8 uses). The price
// totals are formula columns; their computed values are read from `display_value`
// (the API returns `text` empty for formula columns):
//   total         = "כמות שעות (לפי 300)"  (formula8)            — שכט סופי ÷ 300
//   modelMgmt     = "סה\"כ מחיר ניהול מודל" (formula_mkng494f) ÷ 300   (BIM Management)
//   superposition = ("סה\"כ מחיר תאום מערכות" formula_mkngmc97
//                    + "מחיר מידול פתחים"     numeric_mkxsce4b) ÷ 300  (MEP Coordination)

export interface DisciplineBanks {
  modelMgmt:     number | null  // BIM Management bank
  superposition: number | null  // MEP Coordination bank
  total:         number | null  // total budget (שכט סופי ÷ 300)
}

export async function fetchProjectBanks(ma004ItemId: string): Promise<DisciplineBanks> {
  const query = `
    query ($ids: [ID!]!) {
      items(ids: $ids) {
        column_values(ids: ["formula8", "formula_mkng494f", "formula_mkngmc97", "numeric_mkxsce4b"]) {
          id
          text
          ... on FormulaValue { display_value }
        }
      }
    }
  `

  const data = await mondayQuery(query, { ids: [ma004ItemId] }) as {
    items: Array<{ column_values: Array<{ id: string; text: string | null; display_value?: string }> }>
  }

  const item = data.items?.[0]
  if (!item) return { modelMgmt: null, superposition: null, total: null }

  const colMap = Object.fromEntries(item.column_values.map(c => [c.id, c]))
  // Formula columns expose their value via display_value; numeric columns via text.
  const num = (id: string) => {
    const raw = colMap[id]?.display_value ?? colMap[id]?.text ?? ''
    const n = parseFloat(raw.replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  const round = (n: number) => Math.round(n * 100) / 100

  const total         = num('formula8')                                  // שכט סופי ÷ 300
  const modelMgmtPrice     = num('formula_mkng494f')                     // סה"כ מחיר ניהול מודל
  const superpositionPrice = num('formula_mkngmc97') + num('numeric_mkxsce4b') // תאום מערכות + מידול פתחים

  return {
    modelMgmt:     round(modelMgmtPrice / 300),
    superposition: round(superpositionPrice / 300),
    total:         round(total),
  }
}

// ── Milestone completion stats from MI-001-MilestonesProjects ──────────────
// For each project we compute the % of "bills" (milestone subitems) that are
// completed — per discipline and pooled overall. A bill counts as completed when
// its submission status (color_mkyk8mbx) is "Submitted" or "Work completed";
// everything else (Working on it, Future Steps, Rejected, ?, blank) is incomplete.
// Bills are grouped by their parent milestone's team (color_mm06m73n).
// Milestones join to projects via board_relation → MA-004 item id, which the
// EPM project stores as externalIds.mondayItemId.

// Submission-status labels that mean the bill is done.
const MILESTONE_COMPLETED_STATUSES = new Set(['Submitted', 'Work completed'])

// Milestone team label (color_mm06m73n) → discipline key + English display label.
const MILESTONE_DISCIPLINE_MAP: Record<string, { key: string; label: string }> = {
  'ניהול מודל':   { key: 'bimManagement',  label: 'BIM Management' },
  'תיאום מערכות': { key: 'mepCoordination', label: 'MEP Coordination' },
  'מקסים/באין':   { key: 'maximBain',      label: 'Maxim/Bain' },
}

export interface MilestoneDiscipline {
  key:       string
  label:     string
  completed: number
  total:     number
  progress:  number   // round(completed / total * 100)
}

export interface MilestoneStats {
  overallProgress: number | null   // pooled completed/total across all bills; null when no bills
  disciplines:     MilestoneDiscipline[]
}

// Mutable accumulator used while walking the board.
interface MilestoneAcc {
  overall: { completed: number; total: number }
  byKey:   Map<string, { label: string; completed: number; total: number }>
}

export async function fetchMilestoneStatsByProject(): Promise<Map<string, MilestoneStats>> {
  // Page size kept modest: each item pulls its subitems inline, so a large page
  // can blow Monday's per-query complexity budget.
  const query = `
    query ($boardId: ID!, $limit: Int!, $cursor: String) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, cursor: $cursor) {
          cursor
          items {
            column_values(ids: ["color_mm06m73n", "board_relation_mkywzj9x"]) {
              id
              text
              ... on BoardRelationValue { linked_item_ids }
            }
            subitems {
              column_values(ids: ["color_mkyk8mbx"]) {
                id
                text
              }
            }
          }
        }
      }
    }
  `

  const accByProject = new Map<string, MilestoneAcc>()
  let cursor: string | null = null

  do {
    const data = await mondayQuery(query, { boardId: MILESTONES_BOARD_ID, limit: 50, cursor }) as {
      boards: Array<{ items_page: { cursor: string | null; items: Array<{
        column_values: Array<{ id: string; text: string; linked_item_ids?: string[] }>
        subitems: Array<{ column_values: Array<{ id: string; text: string }> }>
      }> } }>
    }

    const items = data.boards[0]?.items_page?.items ?? []
    cursor = data.boards[0]?.items_page?.cursor ?? null

    for (const item of items) {
      const colMap = Object.fromEntries(item.column_values.map(c => [c.id, c]))

      const projectItemId = colMap['board_relation_mkywzj9x']?.linked_item_ids?.[0]
      if (!projectItemId) continue                         // milestone not linked to a project

      const bills = item.subitems ?? []
      if (!bills.length) continue                          // milestone with no bills contributes nothing

      const teamLabel = (colMap['color_mm06m73n']?.text ?? '').trim()
      const discipline = MILESTONE_DISCIPLINE_MAP[teamLabel]  // undefined → counts toward overall only

      let acc = accByProject.get(projectItemId)
      if (!acc) {
        acc = { overall: { completed: 0, total: 0 }, byKey: new Map() }
        accByProject.set(projectItemId, acc)
      }

      for (const bill of bills) {
        const status = (bill.column_values.find(c => c.id === 'color_mkyk8mbx')?.text ?? '').trim()
        const done = MILESTONE_COMPLETED_STATUSES.has(status)

        acc.overall.total += 1
        if (done) acc.overall.completed += 1

        if (discipline) {
          let bucket = acc.byKey.get(discipline.key)
          if (!bucket) {
            bucket = { label: discipline.label, completed: 0, total: 0 }
            acc.byKey.set(discipline.key, bucket)
          }
          bucket.total += 1
          if (done) bucket.completed += 1
        }
      }
    }
  } while (cursor)

  const pct = (completed: number, total: number) => Math.round((completed / total) * 100)

  const result = new Map<string, MilestoneStats>()
  for (const [projectItemId, acc] of accByProject) {
    const disciplines: MilestoneDiscipline[] = Array.from(acc.byKey.entries()).map(([key, b]) => ({
      key,
      label:     b.label,
      completed: b.completed,
      total:     b.total,
      progress:  pct(b.completed, b.total),
    }))
    result.set(projectItemId, {
      overallProgress: acc.overall.total > 0 ? pct(acc.overall.completed, acc.overall.total) : null,
      disciplines,
    })
  }

  return result
}

// ── Dedicated per-project boards ───────────────────────────────────────────
// Each project owns a cluster of boards whose names all start with the project
// number, e.g. for 22234:
//   22234_Congress_Center            ← the main board we want
//   22234_Congress_Center_Members    ← secondary
//   22234_Congress_Center_ModelQA    ← secondary
//   Subitems of 22234_Congress_Center← Monday-generated subitems board
// We page through every board, then for each project number keep only the main
// board: name starts with "<number>_", is not a "Subitems of …" board, and does
// not carry a secondary suffix (_Members / _ModelQA / _Gantt).
//   exactly one main board → return its URL    zero / many → omit (caller falls back)

const MONDAY_SUBDOMAIN = 'easybim-company'

// Suffixes that mark a board as a secondary view of a project, not its main board.
// Covers member rosters, QA boards, Gantt boards (with "_" or " " separator), and
// the per-year timesheet boards (…_2024_TS, …_2023_Timesheet).
const SECONDARY_BOARD_SUFFIXES = ['_Members', '_ModelQA', '_Gantt', ' Gantt', '_TS', '_Timesheet']

interface MondayBoardLite { id: string; name: string }

// True when `name` is the project's MAIN board (not a member/QA/gantt/subitems board).
function isMainProjectBoard(name: string, num: string): boolean {
  if (!name.startsWith(`${num}_`)) return false   // also excludes "Subitems of …" and longer numbers like 222234
  return !SECONDARY_BOARD_SUFFIXES.some(s => name.endsWith(s))
}

export async function fetchDedicatedBoardUrls(
  projectNumbers: string[],
): Promise<{ urls: Map<string, string>; ambiguous: string[] }> {
  // 1. Page through all boards (id + name only).
  const boards: MondayBoardLite[] = []
  for (let page = 1; ; page++) {
    const data = await mondayQuery(
      `query ($page: Int!) { boards(limit: 100, page: $page, state: active) { id name } }`,
      { page },
    ) as { boards: MondayBoardLite[] | null }
    const batch = data.boards ?? []
    if (batch.length === 0) break
    boards.push(...batch)
    if (batch.length < 100) break
  }

  // 2. Match each project number to its single main board.
  const urls = new Map<string, string>()
  const ambiguous: string[] = []

  for (const num of projectNumbers) {
    if (!num) continue
    const matches = boards.filter(b => isMainProjectBoard(b.name, num))
    if (matches.length === 1) {
      urls.set(num, `https://${MONDAY_SUBDOMAIN}.monday.com/boards/${matches[0].id}`)
    } else if (matches.length > 1) {
      ambiguous.push(`${num} (${matches.map(m => m.name).join(' | ')})`)
    }
  }

  return { urls, ambiguous }
}

// ── Updates (combined activity feed) ────────────────────────────────────────
// A read-only, aggregated Monday "updates" feed for a single project, pulled
// live (see /api/projects/[id]/updates). Three sources feed it:
//   • project-board — every item on the project's dedicated board (e.g. 22125_…)
//   • milestone     — MI-001 items that link to the project + their subitem "bills"
//   • master        — the project's single MA-004 master item
// The board sweep (fetchBoardUpdates) is the expensive call: it pages the whole
// board pulling updates inline, so per-item `updates(limit)` is kept small to
// stay well under Monday's per-query complexity budget.

export type UpdateSourceKind = 'project-board' | 'milestone' | 'master' | 'doc'

export interface MondayUpdateCreator {
  id:    string | null
  name:  string | null
  photo: string | null   // photo_thumb_small
}

export interface MondayUpdateAsset {
  id:      string
  name:    string
  url:     string | null   // public_url ?? url
  isImage: boolean
}

export interface MondayUpdateReply {
  id:        string
  body:      string        // HTML — replies can carry tables/lists too
  textBody:  string        // plain text
  createdAt: string
  creator:   MondayUpdateCreator
}

export interface MondayUpdate {
  id:        string
  body:      string        // HTML
  textBody:  string        // plain text
  createdAt: string
  creator:   MondayUpdateCreator
  replies:   MondayUpdateReply[]
  assets:    MondayUpdateAsset[]
  source: {
    kind:     UpdateSourceKind
    label:    string       // e.g. 'Project board', 'Milestones (MI-001)', 'Master (MA-004)'
    itemName: string       // the pulse the update lives on
    itemUrl:  string | null
  }
}

// Shared GraphQL selection for an `updates { … }` node.
const UPDATE_FIELDS = `
  id
  body
  text_body
  created_at
  creator { id name photo_thumb_small }
  replies { id body text_body created_at creator { id name photo_thumb_small } }
  assets  { id name public_url url file_extension }
`

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif', 'tif', 'tiff'])

interface RawAsset { id: string; name: string; public_url: string | null; url: string | null; file_extension: string | null }
interface RawCreator { id: string; name: string; photo_thumb_small: string | null }

interface RawUpdateNode {
  id:         string
  body:       string
  text_body:  string
  created_at: string
  creator:    RawCreator | null
  replies:    Array<{ id: string; body: string; text_body: string; created_at: string; creator: RawCreator | null }> | null
  assets:     RawAsset[] | null
}

function mapCreator(c: RawCreator | null): MondayUpdateCreator {
  return { id: c?.id ?? null, name: c?.name ?? null, photo: c?.photo_thumb_small ?? null }
}

function mapAsset(a: RawAsset): MondayUpdateAsset {
  const ext = (a.file_extension ?? '').replace(/^\./, '').toLowerCase()
  return { id: a.id, name: a.name, url: a.public_url ?? a.url ?? null, isImage: IMAGE_EXTS.has(ext) }
}

/** Build a deep link to a pulse (item/subitem) on a board. */
function pulseUrl(boardId: string | null, itemId: string): string | null {
  if (!boardId) return null
  return `https://${MONDAY_SUBDOMAIN}.monday.com/boards/${boardId}/pulses/${itemId}`
}

/** Deep link to a specific update inside an item's updates pane. */
function updateUrl(boardId: string | null, itemId: string, updateId: string): string | null {
  const base = pulseUrl(boardId, itemId)
  return base ? `${base}/posts/${updateId}` : null
}

/** Extract the board id from a Monday board URL (…/boards/<digits>). */
export function boardIdFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const m = url.match(/\/boards\/(\d+)/)
  return m ? m[1] : null
}

function normalizeUpdate(u: RawUpdateNode, source: MondayUpdate['source']): MondayUpdate {
  return {
    id:        u.id,
    body:      u.body ?? '',
    textBody:  u.text_body ?? '',
    createdAt: u.created_at,
    creator:   mapCreator(u.creator),
    replies:   (u.replies ?? []).map(r => ({
      id:        r.id,
      body:      r.body ?? '',
      textBody:  r.text_body ?? '',
      createdAt: r.created_at,
      creator:   mapCreator(r.creator),
    })),
    assets:    (u.assets ?? []).map(mapAsset),
    source,
  }
}

/** Updates on a single item (used for the MA-004 master item). */
export async function fetchItemUpdates(
  itemId: string,
  source: { kind: UpdateSourceKind; label: string },
  limit = 25,
): Promise<MondayUpdate[]> {
  const query = `
    query ($ids: [ID!], $limit: Int!) {
      items(ids: $ids) {
        id
        name
        board { id }
        updates(limit: $limit) { ${UPDATE_FIELDS} }
      }
    }
  `
  const data = await mondayQuery(query, { ids: [itemId], limit }) as {
    items: Array<{ id: string; name: string; board: { id: string } | null; updates: RawUpdateNode[] | null }> | null
  }
  const item = data.items?.[0]
  if (!item) return []
  const boardId = item.board?.id ?? null
  return (item.updates ?? []).map(u => normalizeUpdate(u, {
    kind: source.kind, label: source.label, itemName: item.name,
    itemUrl: updateUrl(boardId, item.id, u.id) ?? pulseUrl(boardId, item.id),
  }))
}

/** Updates across a board (used for the dedicated project board).
 *
 *  Monday's board-level `updates` feed already contains BOTH the true "Board
 *  Discussion" posts (item = null) and every item's updates (item set) — so a
 *  single paged query replaces the old whole-board items sweep (~10x faster)
 *  AND restores the item attribution the sweep used to lose to de-duping.
 *  Falls back to the legacy per-item sweep if the board feed comes back empty. */
export async function fetchBoardUpdates(
  boardId: string,
  source: { kind: UpdateSourceKind; label: string },
  opts: { perItemLimit?: number; pageSize?: number; maxItems?: number; boardLimit?: number; maxUpdates?: number } = {},
): Promise<MondayUpdate[]> {
  const pageSize   = opts.pageSize ?? 50
  const maxUpdates = opts.maxUpdates ?? 150

  const out: MondayUpdate[] = []
  try {
    const query = `
      query ($boardId: ID!, $limit: Int!, $page: Int!) {
        boards(ids: [$boardId]) {
          updates(limit: $limit, page: $page) {
            ${UPDATE_FIELDS}
            item { id name }
          }
        }
      }
    `
    let page = 1
    while (out.length < maxUpdates) {
      const data = await mondayQuery(query, { boardId, limit: pageSize, page }) as {
        boards: Array<{ updates: Array<RawUpdateNode & { item: { id: string; name: string } | null }> | null }>
      }
      const batch = data.boards?.[0]?.updates ?? []
      for (const u of batch) {
        out.push(normalizeUpdate(u, u.item
          ? { kind: source.kind, label: source.label, itemName: u.item.name,
              itemUrl: updateUrl(boardId, u.item.id, u.id) }
          : { kind: source.kind, label: source.label, itemName: 'Board Discussion',
              itemUrl: `https://${MONDAY_SUBDOMAIN}.monday.com/boards/${boardId}` }))
      }
      if (batch.length < pageSize) break
      page += 1
    }
    if (out.length > 0) return out
  } catch (err) {
    console.error(`[fetchBoardUpdates] board feed failed for ${boardId}, falling back to item sweep:`, err)
  }
  return fetchBoardUpdatesViaItems(boardId, source, opts)
}

/** Legacy fallback: page the whole board pulling per-item updates inline. */
async function fetchBoardUpdatesViaItems(
  boardId: string,
  source: { kind: UpdateSourceKind; label: string },
  opts: { perItemLimit?: number; pageSize?: number; maxItems?: number } = {},
): Promise<MondayUpdate[]> {
  const perItemLimit = opts.perItemLimit ?? 5
  const pageSize     = opts.pageSize ?? 25
  const maxItems     = opts.maxItems ?? 200

  const out: MondayUpdate[] = []

  const query = `
    query ($boardId: ID!, $limit: Int!, $cursor: String, $uLimit: Int!) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, cursor: $cursor) {
          cursor
          items {
            id
            name
            updates(limit: $uLimit) { ${UPDATE_FIELDS} }
          }
        }
      }
    }
  `
  let cursor: string | null = null
  let seen = 0

  do {
    const data = await mondayQuery(query, { boardId, limit: pageSize, cursor, uLimit: perItemLimit }) as {
      boards: Array<{ items_page: { cursor: string | null; items: Array<{ id: string; name: string; updates: RawUpdateNode[] | null }> } }>
    }
    const page  = data.boards?.[0]?.items_page
    const items = page?.items ?? []
    cursor = page?.cursor ?? null

    for (const item of items) {
      seen++
      for (const u of item.updates ?? []) {
        out.push(normalizeUpdate(u, {
          kind: source.kind, label: source.label, itemName: item.name,
          itemUrl: updateUrl(boardId, item.id, u.id),
        }))
      }
    }
    if (seen >= maxItems) break
  } while (cursor)

  return out
}

/** Updates from MI-001 milestones (items + subitem "bills") linked to a project. */
export async function fetchMilestoneUpdatesForProject(
  masterItemId: string,
  source: { kind: UpdateSourceKind; label: string } = { kind: 'milestone', label: 'Milestones (MI-001)' },
  perItemLimit = 10,
): Promise<MondayUpdate[]> {
  const query = `
    query ($boardId: ID!, $limit: Int!, $cursor: String, $uLimit: Int!, $queryParams: ItemsQuery) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, cursor: $cursor, query_params: $queryParams) {
          cursor
          items {
            id
            name
            updates(limit: $uLimit) { ${UPDATE_FIELDS} }
            subitems {
              id
              name
              board { id }
              updates(limit: $uLimit) { ${UPDATE_FIELDS} }
            }
          }
        }
      }
    }
  `
  // board_relation filtering requires the linked item id as a NUMBER — a string yields zero matches.
  const queryParams = {
    rules: [{ column_id: 'board_relation_mkywzj9x', compare_value: [Number(masterItemId)], operator: 'any_of' }],
  }

  const out: MondayUpdate[] = []
  let cursor: string | null = null
  let first = true

  do {
    // query_params can only be sent on the first request; later pages use the cursor alone.
    const variables = first
      ? { boardId: MILESTONES_BOARD_ID, limit: 50, uLimit: perItemLimit, queryParams }
      : { boardId: MILESTONES_BOARD_ID, limit: 50, cursor, uLimit: perItemLimit }

    const data = await mondayQuery(query, variables) as {
      boards: Array<{ items_page: { cursor: string | null; items: Array<{
        id: string; name: string; updates: RawUpdateNode[] | null
        subitems: Array<{ id: string; name: string; board: { id: string } | null; updates: RawUpdateNode[] | null }> | null
      }> } }>
    }
    const page  = data.boards?.[0]?.items_page
    const items = page?.items ?? []
    cursor = page?.cursor ?? null
    first  = false

    for (const item of items) {
      for (const u of item.updates ?? []) {
        out.push(normalizeUpdate(u, {
          kind: source.kind, label: source.label, itemName: item.name,
          itemUrl: updateUrl(MILESTONES_BOARD_ID, item.id, u.id),
        }))
      }
      for (const sub of item.subitems ?? []) {
        const subBoardId = sub.board?.id ?? null
        for (const u of sub.updates ?? []) {
          out.push(normalizeUpdate(u, {
            kind: source.kind, label: source.label, itemName: `${item.name} › ${sub.name}`,
            itemUrl: updateUrl(subBoardId, sub.id, u.id),
          }))
        }
      }
    }
  } while (cursor)

  return out
}

// ── Monday docs on the project board ────────────────────────────────────────
// Docs attached to the board's file columns (fileType MONDAY_DOC) — e.g. the
// "Meetings" doc on 22130. Doc *content edits* surface in the feed: blocks are
// grouped by (day, author) into one feed card each. Only docs living in the
// board's own workspace are included — the "How to" column links Knowledge-
// Center SOP templates from another workspace, which are not project activity.
// Monday exposes block dates at DAY granularity only, so doc cards sort at
// midday of their edit day among the timestamped updates.

interface RawDocBlock {
  id:              string
  type:            string
  content:         string | null
  created_at:      string | null
  updated_at:      string | null
  created_by:      RawCreator | null
  parent_block_id: string | null   // set on blocks nested inside a table/layout cell
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Render one Monday-doc block (Quill-style deltaFormat) to safe-ish HTML —
// the client sanitizes again before injecting, so this only needs to be tidy.
function renderDocBlock(b: RawDocBlock): { html: string; text: string } {
  let parsed: {
    direction?: string
    deltaFormat?: Array<{ insert?: unknown; attributes?: Record<string, unknown> }>
  }
  try { parsed = JSON.parse(b.content ?? '{}') } catch { return { html: '', text: '' } }

  if (b.type === 'divider') return { html: '<hr/>', text: '' }
  if (b.type === 'image')   return { html: '', text: '' }   // auth-gated; dropped client-side anyway

  const dir = parsed.direction === 'rtl' ? ' dir="rtl"' : ''
  let inner = ''
  let text = ''
  for (const op of parsed.deltaFormat ?? []) {
    if (typeof op.insert === 'string') {
      let chunk = esc(op.insert)
      const a = op.attributes ?? {}
      if (a.bold)      chunk = `<strong>${chunk}</strong>`
      if (a.italic)    chunk = `<em>${chunk}</em>`
      if (a.underline) chunk = `<u>${chunk}</u>`
      if (typeof a.link === 'string') chunk = `<a href="${esc(a.link)}">${chunk}</a>`
      inner += chunk
      text += op.insert
    } else if (op.insert && typeof op.insert === 'object' && 'mention' in (op.insert as object)) {
      inner += '<span class="text-[#1e248c] font-semibold">@</span>'
    }
  }
  if (!inner.trim()) return { html: '', text: '' }

  if (/title/.test(b.type)) return { html: `<p${dir}><strong>${inner}</strong></p>`, text }
  if (b.type === 'bulleted list') return { html: `<p${dir}>• ${inner}</p>`, text }
  if (b.type === 'numbered list') return { html: `<p${dir}>◦ ${inner}</p>`, text }
  if (b.type === 'check list') {
    const checked = (parsed as { checked?: boolean }).checked === true
    return { html: `<p${dir}>${checked ? '✓' : '☐'} ${inner}</p>`, text }
  }
  return { html: `<p${dir}>${inner}</p>`, text }
}

// Monday doc `table` (and column `layout`) blocks don't hold their content —
// they reference separate `cell` blocks by id. Rendered as a real <table>
// (the client's .monday-body table styles apply); the referenced cell blocks
// are excluded from the normal block flow so they don't ALSO render as loose
// paragraphs.
type TableCells = Array<Array<{ blockId?: string } | null>>

function parseTableCells(b: RawDocBlock): TableCells {
  try {
    const cells = (JSON.parse(b.content ?? '{}') as { cells?: TableCells }).cells
    return Array.isArray(cells) ? cells : []
  } catch { return [] }
}

// A `cell` block carries only styling — its CONTENT is the child blocks whose
// parent_block_id points at it (in document order).
function renderDocTable(
  b: RawDocBlock,
  childrenByParent: Map<string, RawDocBlock[]>,
): { html: string; text: string } {
  const rows: string[] = []
  const texts: string[] = []
  let any = false
  for (const row of parseTableCells(b)) {
    const tds = (row ?? []).map(c => {
      const kids = c?.blockId ? (childrenByParent.get(c.blockId) ?? []) : []
      const parts = kids.map(renderDocBlock).filter(r => r.html)
      for (const r of parts) if (r.text) texts.push(r.text)
      if (parts.length) any = true
      return `<td>${parts.map(r => r.html).join('')}</td>`
    })
    rows.push(`<tr>${tds.join('')}</tr>`)
  }
  if (!any) return { html: '', text: '' }
  return { html: `<table><tbody>${rows.join('')}</tbody></table>`, text: texts.join(' · ') }
}

// No age cap — the rest of the feed reaches back years too; the per-doc group
// cap alone keeps a long-lived doc from flooding the feed.
const DOC_MAX_GROUPS_PER_DOC = 10

/** Edit activity of the Monday docs attached to a board's file columns. */
export async function fetchBoardDocUpdates(boardId: string): Promise<MondayUpdate[]> {
  // 1. The board's workspace + every item's file-column values.
  const meta = await mondayQuery(`
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        workspace { id }
        items_page(limit: 200) {
          items { id name column_values(types: [file]) { value } }
        }
      }
    }
  `, { boardId }) as {
    boards: Array<{
      workspace: { id: string } | null
      items_page: { items: Array<{ id: string; name: string; column_values: Array<{ value: string | null }> }> }
    }>
  }
  const board = meta.boards?.[0]
  if (!board) return []
  const workspaceId = board.workspace?.id ?? null

  const docRefs = new Map<string, { itemId: string; itemName: string }>()  // objectId → owning item
  for (const item of board.items_page?.items ?? []) {
    for (const cv of item.column_values ?? []) {
      if (!cv.value) continue
      try {
        const files = (JSON.parse(cv.value) as { files?: Array<{ fileType?: string; objectId?: number | string }> }).files ?? []
        for (const f of files) {
          if (f.fileType === 'MONDAY_DOC' && f.objectId != null) {
            docRefs.set(String(f.objectId), { itemId: item.id, itemName: item.name })
          }
        }
      } catch { /* not a files payload */ }
    }
  }
  if (docRefs.size === 0) return []

  // 2. The docs themselves, with blocks (author + day per block). Queried ONE
  // id at a time: docs(object_ids:) silently drops docs from multi-id queries
  // (same quirk items(ids:) has — see fetchMA003ByItemIds).
  type RawDoc = {
    object_id: string
    name: string
    url: string | null
    workspace: { id: string } | null
    blocks: RawDocBlock[] | null
  }
  const docQuery = `
    query ($ids: [ID!]) {
      docs(object_ids: $ids, limit: 1) {
        object_id
        name
        url
        workspace { id }
        blocks(limit: 400) {
          id type content created_at updated_at parent_block_id
          created_by { id name photo_thumb_small }
        }
      }
    }
  `
  const fetched = await Promise.allSettled(
    [...docRefs.keys()].map(id =>
      mondayQuery(docQuery, { ids: [id] }) as Promise<{ docs: RawDoc[] | null }>
    ),
  )
  const docs: RawDoc[] = []
  for (const r of fetched) {
    if (r.status === 'fulfilled') docs.push(...(r.value.docs ?? []))
  }

  const out: MondayUpdate[] = []

  for (const doc of docs) {
    // Cross-workspace docs are SOP templates, not project activity.
    if (workspaceId && doc.workspace?.id && doc.workspace.id !== workspaceId) continue
    const ref = docRefs.get(String(doc.object_id))
    const blocks = doc.blocks ?? []

    // Blocks nested inside a table/layout cell (parent_block_id set) render
    // within that cell, never as loose flow paragraphs.
    const childrenByParent = new Map<string, RawDocBlock[]>()
    for (const b of blocks) {
      if (!b.parent_block_id) continue
      let list = childrenByParent.get(b.parent_block_id)
      if (!list) { list = []; childrenByParent.set(b.parent_block_id, list) }
      list.push(b)
    }

    // A table's edit day is the NEWEST edit among itself, its cells, and the
    // blocks inside them.
    const tableDate = new Map<string, string>()
    for (const b of blocks) {
      if (b.type !== 'table' && b.type !== 'layout') continue
      let maxDate = (b.updated_at ?? b.created_at ?? '').slice(0, 10)
      for (const row of parseTableCells(b)) {
        for (const c of row ?? []) {
          if (!c?.blockId) continue
          for (const kid of childrenByParent.get(c.blockId) ?? []) {
            const d = (kid.updated_at ?? kid.created_at ?? '').slice(0, 10)
            if (d > maxDate) maxDate = d
          }
        }
      }
      tableDate.set(b.id, maxDate)
    }

    // Group blocks by (edit day, author), preserving document order inside a group.
    const groups = new Map<string, { date: string; creator: RawCreator | null; html: string[]; text: string[] }>()
    for (const b of blocks) {
      if (b.parent_block_id || b.type === 'cell') continue
      const isTable = b.type === 'table' || b.type === 'layout'
      const date = isTable
        ? (tableDate.get(b.id) ?? '')
        : (b.updated_at ?? b.created_at ?? '').slice(0, 10)
      if (!date) continue
      const { html, text } = isTable ? renderDocTable(b, childrenByParent) : renderDocBlock(b)
      if (!html) continue
      const key = `${date}|${b.created_by?.id ?? '?'}`
      let g = groups.get(key)
      if (!g) { g = { date, creator: b.created_by, html: [], text: [] }; groups.set(key, g) }
      g.html.push(html)
      if (text) g.text.push(text)
    }

    const newest = [...groups.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, DOC_MAX_GROUPS_PER_DOC)

    for (const g of newest) {
      if (g.text.join('').trim().length === 0) continue
      out.push({
        id:        `doc-${doc.object_id}-${g.date}-${g.creator?.id ?? '?'}`,
        body:      g.html.join(''),
        textBody:  g.text.join('\n'),
        createdAt: `${g.date}T12:00:00Z`,   // Monday exposes block dates at day granularity
        creator:   mapCreator(g.creator),
        replies:   [],
        assets:    [],
        source: {
          kind:     'doc',
          label:    'Doc',
          itemName: ref ? `${ref.itemName} › ${doc.name}` : doc.name,
          itemUrl:  doc.url ?? (ref ? pulseUrl(boardId, ref.itemId) : null),
        },
      })
    }
  }
  return out
}
