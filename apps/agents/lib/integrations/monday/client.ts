// Generic monday.com GraphQL client (cross-agent integration).
// Uses MONDAY_API_TOKEN (write scope). Board/column IDs are passed in by the
// caller (see each agent's board.ts, e.g. lib/agents/peacock/board.ts).

const MONDAY_API = 'https://api.monday.com/v2'
const MONDAY_API_VERSION = '2024-10'

function token(): string {
  const t = process.env.MONDAY_API_TOKEN
  if (!t) throw new Error('MONDAY_API_TOKEN is not configured')
  return t
}

export async function mondayApi<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token(),
      'API-Version': MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    throw new Error(`monday API error: ${JSON.stringify(json.errors)}`)
  }
  return json.data as T
}

export interface MondayColumnValue {
  id: string
  text: string | null
  value: string | null
  /** Present for mirror / formula / board-relation columns (their computed label). */
  display_value?: string | null
}

export interface MondayItem {
  id: string
  name: string
  column_values: MondayColumnValue[]
}

// Shared column_values selection: includes display_value for the column types whose
// computed label is NOT exposed via `text` (mirror / formula / board-relation).
const COLUMN_VALUES = `column_values(ids: $columnIds) {
  id text value
  ... on MirrorValue { display_value }
  ... on FormulaValue { display_value }
  ... on BoardRelationValue { display_value }
}`

/** Items in a board filtered to a set of status label IDs (e.g. [7,9] = Idea,Drafting). */
export async function getItemsByStatusLabelIds(
  boardId: string,
  statusColumnId: string,
  labelIds: number[],
  columnIds: string[]
): Promise<MondayItem[]> {
  // Monday 2024-10: query_params column_id is ID!, compare_value is the CompareValue
  // scalar, and a status `any_of` filter matches on label *index* as integers
  // (string indexes silently match nothing).
  const query = `
    query ($boardId: ID!, $statusColumnId: ID!, $labelIds: CompareValue!, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(
          limit: 100,
          query_params: { rules: [{ column_id: $statusColumnId, compare_value: $labelIds, operator: any_of }] }
        ) {
          items { id name ${COLUMN_VALUES} }
        }
      }
    }`
  const data = await mondayApi<{ boards: { items_page: { items: MondayItem[] } }[] }>(query, {
    boardId,
    statusColumnId,
    labelIds,
    columnIds,
  })
  return data.boards?.[0]?.items_page?.items ?? []
}

/** All items on a board (paginated via items_page + next_items_page), with chosen columns. */
export async function getAllItems(
  boardId: string,
  columnIds: string[],
  pageLimit = 100
): Promise<MondayItem[]> {
  const firstQ = `
    query ($boardId: ID!, $columnIds: [String!], $limit: Int!) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit) {
          cursor
          items { id name ${COLUMN_VALUES} }
        }
      }
    }`
  const nextQ = `
    query ($cursor: String!, $columnIds: [String!], $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) {
        cursor
        items { id name ${COLUMN_VALUES} }
      }
    }`

  const out: MondayItem[] = []
  const first = await mondayApi<{ boards: { items_page: { cursor: string | null; items: MondayItem[] } }[] }>(
    firstQ,
    { boardId, columnIds, limit: pageLimit }
  )
  let page = first.boards?.[0]?.items_page ?? null
  while (page) {
    out.push(...(page.items ?? []))
    if (!page.cursor) break
    const next = await mondayApi<{ next_items_page: { cursor: string | null; items: MondayItem[] } }>(nextQ, {
      cursor: page.cursor,
      columnIds,
      limit: pageLimit,
    })
    page = next.next_items_page ?? null
  }
  return out
}

/** Fetch specific items by id (with chosen columns). */
export async function getItems(itemIds: string[], columnIds: string[]): Promise<MondayItem[]> {
  const query = `
    query ($itemIds: [ID!]!, $columnIds: [String!]) {
      items(ids: $itemIds) { id name ${COLUMN_VALUES} }
    }`
  const data = await mondayApi<{ items: MondayItem[] }>(query, { itemIds, columnIds })
  return data.items ?? []
}

/** column_values is a JSON object, e.g. { status: { label: "Drafting" }, date_col: { date: "2026-06-29" } } */
export async function createItem(
  boardId: string,
  groupId: string,
  itemName: string,
  columnValues: Record<string, unknown>
): Promise<string> {
  const query = `
    mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $cols: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $cols) { id }
    }`
  const data = await mondayApi<{ create_item: { id: string } }>(query, {
    boardId,
    groupId,
    itemName,
    cols: JSON.stringify(columnValues),
  })
  return data.create_item.id
}

export async function changeColumnValues(
  boardId: string,
  itemId: string,
  columnValues: Record<string, unknown>
): Promise<void> {
  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $cols: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $cols) { id }
    }`
  await mondayApi(query, { boardId, itemId, cols: JSON.stringify(columnValues) })
}

export async function createUpdate(itemId: string, bodyHtml: string): Promise<string> {
  const query = `
    mutation ($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) { id }
    }`
  const data = await mondayApi<{ create_update: { id: string } }>(query, { itemId, body: bodyHtml })
  return data.create_update.id
}

/**
 * Attach a file to an update via Monday's multipart file endpoint (GraphQL
 * multipart request spec: `query` + `map` + the file part). Used to attach a
 * generated branded image to a post item.
 */
export async function addFileToUpdate(
  updateId: string,
  bytes: Buffer,
  filename: string,
  mimeType = 'image/png'
): Promise<void> {
  const form = new FormData()
  form.append('query', `mutation ($file: File!) { add_file_to_update(update_id: ${updateId}, file: $file) { id } }`)
  form.append('map', JSON.stringify({ image: 'variables.file' }))
  form.append('image', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename)
  const res = await fetch(`${MONDAY_API}/file`, {
    method: 'POST',
    headers: { Authorization: token(), 'API-Version': MONDAY_API_VERSION },
    body: form,
  })
  const json = await res.json()
  if (json.errors) {
    throw new Error(`monday file upload error: ${JSON.stringify(json.errors)}`)
  }
}

export interface MondayReply {
  id: string
  text_body: string
  creator_id: string
  created_at: string
}

export interface MondayUpdate {
  id: string
  body: string
  text_body: string
  created_at: string
  creator_id: string
  replies: MondayReply[]
}

export async function getUpdates(itemId: string, limit = 25): Promise<MondayUpdate[]> {
  // Include replies — Maxim's revise feedback is usually a reply to the draft update,
  // not a new top-level update, so the watcher must read the reply thread too.
  const query = `
    query ($itemId: ID!, $limit: Int!) {
      items(ids: [$itemId]) {
        updates(limit: $limit) {
          id body text_body created_at creator_id
          replies { id text_body creator_id created_at }
        }
      }
    }`
  const data = await mondayApi<{ items: { updates: MondayUpdate[] }[] }>(query, { itemId, limit })
  return data.items?.[0]?.updates ?? []
}

export interface MondayAsset {
  id: string
  name: string
  file_extension: string | null
  public_url: string | null
  url: string | null
}

/** All file assets attached to an item's Updates (comments). */
export async function getUpdateAssets(itemId: string): Promise<MondayAsset[]> {
  const query = `
    query ($itemId: ID!) {
      items(ids: [$itemId]) {
        updates { assets { id name file_extension public_url url } }
      }
    }`
  const data = await mondayApi<{ items: { updates: { assets: MondayAsset[] }[] }[] }>(query, { itemId })
  const assets: MondayAsset[] = []
  for (const u of data.items?.[0]?.updates ?? []) assets.push(...(u.assets ?? []))
  return assets
}

/** Search a board's items by name (contains), returning chosen columns. */
export async function searchItemsByName(
  boardId: string,
  term: string,
  columnIds: string[]
): Promise<MondayItem[]> {
  const query = `
    query ($boardId: ID!, $term: CompareValue!, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(
          limit: 25,
          query_params: { rules: [{ column_id: "name", compare_value: $term, operator: contains_text }] }
        ) {
          items { id name ${COLUMN_VALUES} }
        }
      }
    }`
  const data = await mondayApi<{ boards: { items_page: { items: MondayItem[] } }[] }>(query, {
    boardId,
    term,
    columnIds,
  })
  return data.boards?.[0]?.items_page?.items ?? []
}

/** Bell + email notification. targetType "Project" for an item, "Post" for an update. */
export async function createNotification(
  userId: string,
  targetId: string,
  text: string,
  targetType: 'Project' | 'Post' = 'Project'
): Promise<void> {
  const query = `
    mutation ($userId: ID!, $targetId: ID!, $text: String!, $targetType: NotificationTargetType!) {
      create_notification(user_id: $userId, target_id: $targetId, text: $text, target_type: $targetType) { id }
    }`
  await mondayApi(query, { userId, targetId, text, targetType })
}
