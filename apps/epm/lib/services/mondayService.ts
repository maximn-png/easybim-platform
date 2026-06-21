// Monday.com GraphQL API v2 service.
// Requires MONDAY_API_TOKEN env var. Not called until token is set.
// Used by the /api/sync/projects route for automated background sync.

const MONDAY_API_URL = 'https://api.monday.com/v2'

const MA004_BOARD_ID = '7321609006'

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
const DONE_STATUS_IDS = new Set([1, 9]) // "Finished", "DONE" → exclude from active

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
  status:        'Working on it' | 'On Hold' | 'Not Started' | 'Stuck' | null
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
}

export interface TS001HoursSummary {
  actualHours: number
}

// ── MA-004: Active projects ────────────────────────────────────────────────

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
      if (statusIndex !== null && DONE_STATUS_IDS.has(statusIndex)) continue
      const status = statusIndex !== null ? (STATUS_MAP[statusIndex] ?? null) : null

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
        column_values(ids: ["multiple_person_mkpsmr4k", "multiple_person_mkpskxyf", "multiple_person_mm2tw6be", "link_mkpste", "link_mkqmrce0"]) {
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
