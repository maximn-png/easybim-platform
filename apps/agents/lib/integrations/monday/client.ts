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

export interface MondayItem {
  id: string
  name: string
  column_values: { id: string; text: string | null; value: string | null }[]
}

/** Items in a board filtered to a set of status label IDs (e.g. [7,9] = Idea,Drafting). */
export async function getItemsByStatusLabelIds(
  boardId: string,
  statusColumnId: string,
  labelIds: number[],
  columnIds: string[]
): Promise<MondayItem[]> {
  const query = `
    query ($boardId: ID!, $statusColumnId: String!, $labelIds: [String!]!, $columnIds: [String!]) {
      boards(ids: [$boardId]) {
        items_page(
          limit: 100,
          query_params: { rules: [{ column_id: $statusColumnId, compare_value: $labelIds, operator: any_of }] }
        ) {
          items { id name column_values(ids: $columnIds) { id text value } }
        }
      }
    }`
  const data = await mondayApi<{ boards: { items_page: { items: MondayItem[] } }[] }>(query, {
    boardId,
    statusColumnId,
    labelIds: labelIds.map(String),
    columnIds,
  })
  return data.boards?.[0]?.items_page?.items ?? []
}

/** Fetch specific items by id (with chosen columns). */
export async function getItems(itemIds: string[], columnIds: string[]): Promise<MondayItem[]> {
  const query = `
    query ($itemIds: [ID!]!, $columnIds: [String!]) {
      items(ids: $itemIds) { id name column_values(ids: $columnIds) { id text value } }
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

export interface MondayUpdate {
  id: string
  body: string
  text_body: string
  created_at: string
  creator_id: string
}

export async function getUpdates(itemId: string, limit = 25): Promise<MondayUpdate[]> {
  const query = `
    query ($itemId: ID!, $limit: Int!) {
      items(ids: [$itemId]) {
        updates(limit: $limit) { id body text_body created_at creator_id }
      }
    }`
  const data = await mondayApi<{ items: { updates: MondayUpdate[] }[] }>(query, { itemId, limit })
  return data.items?.[0]?.updates ?? []
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
