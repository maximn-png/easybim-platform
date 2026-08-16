// One-off import: the Monday EasyBIM_Posts board → Peacock's local content plan.
// After this runs, Peacock is fully off Monday: posts, statuses, owners, publish
// dates and the Updates discussion all live in the platform.
//
// Idempotent — each post records its `mondayItemId`, so a second run updates the
// same rows instead of duplicating them (chat messages are only imported once).
// Also normalizes rows written under the old 5-status enum (`ready`).
//
// Usage (from apps/agents):
//   node .\migrate-peacock-posts.mjs            # import
//   node .\migrate-peacock-posts.mjs --dry-run  # report only, writes nothing

import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'

const DRY = process.argv.includes('--dry-run')

const BOARD_ID = '18419189644' // EasyBIM_Posts
const MONDAY_API = 'https://api.monday.com/v2'
const MONDAY_API_VERSION = '2024-10'
const DRAFT_WINDOW_DAYS = 4
/** An update this long is Peacock's draft; shorter ones are review comments. */
const DRAFT_MIN_CHARS = 300

// Board Status label → local PostStatus.
const STATUS_MAP = {
  'Idea': 'idea',
  'Drafting': 'drafting',
  'Pending Approval': 'pending_approval',
  'Approved': 'approved',
  'Ready to Publish': 'ready_to_publish',
  'Scheduled': 'scheduled',
  'Published': 'published',
  'Revise': 'revise',
}
const VALID_TYPES = [
  '1. Professional', '2. Client Connection', '3. New Employee',
  '4. Project', '5. Social', '6. Personal', '7. Other',
]

// ---- env (read straight from .env.local, like the other scripts here) -------

function env(key) {
  if (process.env[key]) return process.env[key]
  try {
    const file = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
    const line = file.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
    if (!line) return undefined
    let raw = line.slice(key.length + 1).trim()
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1)
    return raw
  } catch {
    return undefined
  }
}

const MONDAY_TOKEN = env('MONDAY_API_TOKEN')
const MONGODB_URI = env('MONGODB_URI')
const CLERK_SECRET = env('CLERK_SECRET_KEY')
if (!MONDAY_TOKEN) throw new Error('MONDAY_API_TOKEN missing (env or .env.local)')
if (!MONGODB_URI) throw new Error('MONGODB_URI missing (env or .env.local)')

// ---- monday ----------------------------------------------------------------

async function monday(query, variables = {}) {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: MONDAY_TOKEN, 'API-Version': MONDAY_API_VERSION },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`monday API error: ${JSON.stringify(json.errors)}`)
  return json.data
}

/** Resolve the board's columns by title/type, so we don't hardcode ids that may drift. */
async function resolveColumns() {
  const data = await monday(
    `query ($boardId: ID!) { boards(ids: [$boardId]) { name columns { id title type } } }`,
    { boardId: BOARD_ID }
  )
  const board = data.boards?.[0]
  if (!board) throw new Error(`board ${BOARD_ID} not found (token scope?)`)
  const cols = board.columns ?? []
  const byType = (t) => cols.filter((c) => c.type === t)
  const byTitle = (re) => cols.find((c) => re.test(c.title))

  const map = {
    status: byTitle(/^status$/i)?.id ?? byType('status')[0]?.id,
    postType: byTitle(/post\s*type/i)?.id ?? byType('dropdown')[0]?.id,
    publishDate: byTitle(/publish/i)?.id ?? byType('date')[0]?.id,
    owner: byTitle(/^owner$/i)?.id ?? byType('people')[0]?.id,
    driveLink: byTitle(/drive/i)?.id ?? byType('link')[0]?.id,
  }
  console.log(`board "${board.name}" columns →`, map)
  return map
}

async function fetchItems(columnIds) {
  const ids = columnIds.filter(Boolean)
  const query = `
    query ($boardId: ID!, $columnIds: [String!], $limit: Int!) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit) {
          cursor
          items {
            id name
            column_values(ids: $columnIds) { id text value }
            updates(limit: 50) {
              id body text_body created_at creator_id
              replies { id text_body creator_id created_at }
            }
          }
        }
      }
    }`
  const nextQuery = `
    query ($cursor: String!, $columnIds: [String!], $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) {
        cursor
        items {
          id name
          column_values(ids: $columnIds) { id text value }
          updates(limit: 50) {
            id body text_body created_at creator_id
            replies { id text_body creator_id created_at }
          }
        }
      }
    }`

  const out = []
  const first = await monday(query, { boardId: BOARD_ID, columnIds: ids, limit: 50 })
  let page = first.boards?.[0]?.items_page ?? null
  while (page) {
    out.push(...(page.items ?? []))
    if (!page.cursor) break
    const next = await monday(nextQuery, { cursor: page.cursor, columnIds: ids, limit: 50 })
    page = next.next_items_page ?? null
  }
  return out
}

// ---- clerk (optional: match an owner name to a portal user) ------------------

async function loadClerkUsers() {
  if (!CLERK_SECRET) {
    console.log('CLERK_SECRET_KEY not set — owners import as name only (no linked portal user).')
    return []
  }
  try {
    const res = await fetch('https://api.clerk.com/v1/users?limit=200', {
      headers: { Authorization: `Bearer ${CLERK_SECRET}` },
    })
    if (!res.ok) throw new Error(`clerk ${res.status}`)
    const users = await res.json()
    return users.map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '',
      email: u.email_addresses?.[0]?.email_address ?? '',
      imageUrl: u.image_url ?? null,
    }))
  } catch (err) {
    console.log(`Clerk lookup failed (${err.message}) — owners import as name only.`)
    return []
  }
}

function matchClerkUser(users, mondayName) {
  if (!mondayName) return null
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const target = norm(mondayName)
  return (
    users.find((u) => norm(u.name) === target) ??
    users.find((u) => target && norm(u.email).startsWith(`${target.split(' ')[0]}.`)) ??
    null
  )
}

// ---- transform -------------------------------------------------------------

const text = (item, colId) => (colId ? item.column_values.find((c) => c.id === colId)?.text?.trim() || null : null)

function mapStatus(label) {
  if (!label) return 'idea' // the board leaves brand-new items blank
  return STATUS_MAP[label] ?? 'idea'
}

function mapPostType(raw) {
  if (!raw) return null
  const exact = VALID_TYPES.find((t) => t === raw.trim())
  if (exact) return exact
  // Dropdowns can come back multi-valued ("4. Project, 1. Professional") — take the first known one.
  const first = raw.split(',').map((s) => s.trim()).find((s) => VALID_TYPES.includes(s))
  return first ?? null
}

function parseDate(raw) {
  if (!raw) return null
  const d = new Date(`${raw}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function draftStartFor(publishDate) {
  if (!publishDate) return null
  const d = new Date(publishDate)
  d.setDate(d.getDate() - DRAFT_WINDOW_DAYS)
  return d
}

/**
 * The Monday Updates thread → the post's draft + its chat messages.
 * The newest long update is the live draft; everything is replayed as thread
 * messages so the discussion survives the move.
 */
function extractThread(item) {
  const updates = [...(item.updates ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const messages = []
  let draftHtml = null

  for (const u of updates) {
    const body = (u.body ?? '').trim()
    const plain = (u.text_body ?? '').trim()
    if (!plain) continue
    const isDraft = plain.length >= DRAFT_MIN_CHARS
    if (isDraft) draftHtml = body || plain // later drafts overwrite earlier ones
    messages.push({
      role: isDraft ? 'assistant' : 'user',
      content: plain,
      createdAt: new Date(u.created_at),
    })
    for (const r of [...(u.replies ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const rp = (r.text_body ?? '').trim()
      if (rp) messages.push({ role: 'user', content: rp, createdAt: new Date(r.created_at) })
    }
  }
  return { draftHtml, messages }
}

// ---- run -------------------------------------------------------------------

const cols = await resolveColumns()
const items = await fetchItems([cols.status, cols.postType, cols.publishDate, cols.owner, cols.driveLink])
console.log(`\nfetched ${items.length} board items`)

const clerkUsers = await loadClerkUsers()

const conn = await mongoose.createConnection(MONGODB_URI).asPromise()
const posts = conn.db.collection('peacock_posts')
const conversations = conn.db.collection('agent_conversations')
const agentMessages = conn.db.collection('agent_messages')

// Rows written under the old 5-status enum, before this migration.
if (!DRY) {
  const fixed = await posts.updateMany({ status: 'ready' }, { $set: { status: 'ready_to_publish' } })
  if (fixed.modifiedCount) console.log(`normalized ${fixed.modifiedCount} legacy "ready" posts → ready_to_publish`)

  // Posts that predate the timeline have a publish date but no drafting window,
  // so they would draw as 1-day markers instead of bars. Give them the default.
  const noWindow = await posts.find({ publishDate: { $ne: null }, draftStartDate: null }).toArray()
  for (const p of noWindow) {
    await posts.updateOne({ _id: p._id }, { $set: { draftStartDate: draftStartFor(new Date(p.publishDate)) } })
  }
  if (noWindow.length) console.log(`backfilled draftStartDate on ${noWindow.length} posts`)
}

let created = 0
let updated = 0
let threads = 0
let importedMessages = 0

for (const item of items) {
  const statusLabel = text(item, cols.status)
  const publishDate = parseDate(text(item, cols.publishDate))
  const ownerName = text(item, cols.owner)
  const clerk = matchClerkUser(clerkUsers, ownerName)
  const { draftHtml, messages } = extractThread(item)

  const doc = {
    title: item.name,
    status: mapStatus(statusLabel),
    postType: mapPostType(text(item, cols.postType)),
    publishDate,
    draftStartDate: draftStartFor(publishDate),
    driveLink: text(item, cols.driveLink),
    ownerName: ownerName ?? null,
    ownerUserId: clerk?.id ?? null,
    ownerImageUrl: clerk?.imageUrl ?? null,
    mondayItemId: String(item.id),
    updatedAt: new Date(),
  }
  if (draftHtml) doc.body = draftHtml

  console.log(
    `- ${item.name}\n    status=${doc.status} type=${doc.postType ?? '—'} publish=${publishDate ? publishDate.toISOString().slice(0, 10) : '—'} ` +
    `owner=${ownerName ?? '—'}${clerk ? ` (→ ${clerk.id})` : ''} draft=${draftHtml ? `${draftHtml.length} chars` : 'none'} messages=${messages.length}`
  )

  if (DRY) continue

  const existing = await posts.findOne({ mondayItemId: String(item.id) })
  let postId
  if (existing) {
    await posts.updateOne({ _id: existing._id }, { $set: doc })
    postId = existing._id
    updated += 1
  } else {
    const res = await posts.insertOne({ ...doc, createdAt: new Date() })
    postId = res.insertedId
    created += 1
  }

  // The Updates thread → the post's Peacock conversation. Only on first import,
  // so re-running never duplicates the discussion.
  if (messages.length > 0) {
    const existingConvo = await conversations.findOne({ agentKey: 'peacock', postId: String(postId) })
    if (!existingConvo) {
      const convo = await conversations.insertOne({
        agentKey: 'peacock',
        postId: String(postId),
        title: item.name.slice(0, 80),
        shared: false,
        lastMessageAt: messages[messages.length - 1].createdAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await agentMessages.insertMany(
        messages.map((m) => ({
          agentKey: 'peacock',
          conversationId: convo.insertedId,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          updatedAt: m.createdAt,
        }))
      )
      threads += 1
      importedMessages += messages.length
    }
  }
}

console.log(
  DRY
    ? `\nDRY RUN — nothing written. Would import ${items.length} posts.`
    : `\ndone: ${created} created, ${updated} updated, ${threads} threads imported (${importedMessages} messages).`
)

await conn.close()
