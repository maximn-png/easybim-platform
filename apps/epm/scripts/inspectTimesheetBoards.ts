// Read-only discovery for the Monday→TimeEntry hours backfill.
// Finds TS-002's board id, dumps every TS board's columns, and lists the
// distinct Subject/Subtopic label values so the backfill's column-id constants
// and SUBJECT_MAP can be filled in from real data.
//
//   cd apps/epm && npx tsx --env-file=.env.local scripts/inspectTimesheetBoards.ts

const MONDAY_API_URL = 'https://api.monday.com/v2'

const KNOWN_TS_BOARDS: Record<string, string> = {
  '6802118492':  'TS-001 — Projects Timesheet',
  '18396186789': 'TS-003 — EasyBIM Timesheet',
  '18393331343': 'TS-004 — Completed Projects Timesheet',
  '18411540568': 'TS-005 — Medical Projects Timesheet',
}

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

async function findTs002BoardId(): Promise<string | null> {
  const data = await mondayQuery(`query { boards(limit: 500) { id name } }`) as {
    boards: Array<{ id: string; name: string }>
  }
  const hit = data.boards.find(b =>
    /TS-?002/i.test(b.name) || /interior\s*bim/i.test(b.name)
  )
  if (hit) console.log(`TS-002 found: id=${hit.id} name="${hit.name}"`)
  else {
    console.log('TS-002 not found by name. Boards containing "TS" or "timesheet":')
    for (const b of data.boards.filter(b => /\bTS\b|TS-|timesheet/i.test(b.name)))
      console.log(`  ${b.id}  ${b.name}`)
  }
  return hit?.id ?? null
}

async function dumpColumns(boardId: string, label: string) {
  const data = await mondayQuery(
    `query ($ids: [ID!]) { boards(ids: $ids) { id name columns { id title type } } }`,
    { ids: [boardId] },
  ) as { boards: Array<{ id: string; name: string; columns: Array<{ id: string; title: string; type: string }> }> }
  const board = data.boards[0]
  if (!board) { console.log(`\n${label} (${boardId}): NOT ACCESSIBLE`); return }
  console.log(`\n${label} — "${board.name}" (${board.id})`)
  for (const c of board.columns) console.log(`  ${c.id.padEnd(28)} ${c.type.padEnd(16)} ${c.title}`)
}

// Distinct text values of the given columns across all items (paged).
async function distinctValues(boardId: string, label: string, columnIds: string[]) {
  const counts: Record<string, Map<string, number>> = {}
  for (const id of columnIds) counts[id] = new Map()
  let cursor: string | null = null
  let total = 0
  do {
    const data = await mondayQuery(
      `query ($boardId: ID!, $cursor: String, $colIds: [String!]) {
        boards(ids: [$boardId]) {
          items_page(limit: 500, cursor: $cursor) {
            cursor
            items { id column_values(ids: $colIds) { id text } }
          }
        }
      }`,
      { boardId, cursor, colIds: columnIds },
    ) as { boards: Array<{ items_page: { cursor: string | null; items: Array<{ column_values: Array<{ id: string; text: string | null }> }> } }> }
    const page = data.boards[0]?.items_page
    cursor = page?.cursor ?? null
    for (const item of page?.items ?? []) {
      total++
      for (const cv of item.column_values) {
        const key = (cv.text ?? '').trim() || '(blank)'
        counts[cv.id].set(key, (counts[cv.id].get(key) ?? 0) + 1)
      }
    }
  } while (cursor)
  console.log(`\n${label} — ${total} items; distinct values:`)
  for (const [colId, map] of Object.entries(counts)) {
    console.log(`  column ${colId}:`)
    for (const [v, n] of [...map.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`    ${String(n).padStart(6)}  ${v}`)
  }
}

async function main() {
  const ts002Id = await findTs002BoardId()

  for (const [id, label] of Object.entries(KNOWN_TS_BOARDS)) await dumpColumns(id, label)
  if (ts002Id) await dumpColumns(ts002Id, 'TS-002 — InteriorBIM Timesheet')

  // Label-type columns are candidates for Subject/Subtopic; scan their values.
  // Re-query columns to pick label/dropdown/status columns automatically.
  const allBoards = ts002Id ? [...Object.keys(KNOWN_TS_BOARDS), ts002Id] : Object.keys(KNOWN_TS_BOARDS)
  for (const boardId of allBoards) {
    const data = await mondayQuery(
      `query ($ids: [ID!]) { boards(ids: $ids) { name columns { id title type } } }`,
      { ids: [boardId] },
    ) as { boards: Array<{ name: string; columns: Array<{ id: string; title: string; type: string }> }> }
    const cols = data.boards[0]?.columns ?? []
    const labelCols = cols.filter(c => ['status', 'dropdown'].includes(c.type) && c.id !== 'label__1')
      .map(c => c.id)
    const scan = ['label__1', ...labelCols].filter(id => cols.some(c => c.id === id))
    if (scan.length) await distinctValues(boardId, `${data.boards[0]?.name} (${boardId})`, scan)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
