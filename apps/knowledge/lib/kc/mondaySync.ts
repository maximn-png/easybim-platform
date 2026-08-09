import { mondayQuery } from '@/lib/integrations/monday'
import { connectDB } from '@/lib/db/mongoose'
import Document from '@/lib/models/Document'
import MondayTreeItem from '@/lib/models/MondayTreeItem'

// Same board/group as scripts/digestRevitDocs.ts — this file owns the
// Monday-query/parse logic now; the script imports fetchDocsGroupItems from
// here instead of keeping its own copy.
const BOARD_ID = 3178661685
const DOCS_GROUP_ID = 'new_group'
const WORKSPACE_ID = 'ws1'
const PARENT_PATH = ['Revit', 'Docs']

interface MondayItem {
  id: string
  name: string
  column_values: Array<{ id: string; text: string | null; value: string | null; type: string }>
}

interface DocsGroupResult {
  boards: Array<{ groups: Array<{ items_page: { items: MondayItem[] } }> }>
}

export interface DocsGroupItem {
  name: string
  fileId: string
  mondayItemId: string
}

export async function fetchDocsGroupItems(): Promise<DocsGroupItem[]> {
  const query = `query {
    boards(ids: [${BOARD_ID}]) {
      groups(ids: ["${DOCS_GROUP_ID}"]) {
        items_page(limit: 100) {
          items { id name column_values(ids: ["files1"]) { id text value type } }
        }
      }
    }
  }`
  const data = await mondayQuery<DocsGroupResult>(query)
  const items = data.boards[0]?.groups[0]?.items_page.items ?? []
  const out: DocsGroupItem[] = []
  for (const item of items) {
    const cv = item.column_values[0]
    if (!cv?.value) continue
    const parsed = JSON.parse(cv.value) as { files?: Array<{ fileId?: string; fileType?: string }> }
    const file = parsed.files?.[0]
    if (file?.fileType === 'GOOGLE_DRIVE' && file.fileId) {
      out.push({ name: item.name, fileId: file.fileId, mondayItemId: item.id })
    }
  }
  return out
}

const VIDEOS_GROUP_ID = 'new_group19237'

export interface VideosGroupItem {
  name: string
  driveId: string
  descEn: string
  descHe: string
  mondayItemId: string
}

interface VideosGroupResult {
  boards: Array<{ groups: Array<{ items_page: { items: Array<{
    id: string
    name: string
    column_values: Array<{ id: string; text: string | null; value: string | null; type: string }>
  }> } }> }>
}

// Same board as fetchDocsGroupItems, but the "Videos" group: each item's
// files1 column holds a Google Drive *video* file link (not a Google Doc),
// so — unlike Docs — there's nothing to digest into blocks; the drive file
// id plus the board's own bilingual description columns are all a video
// page needs.
export async function fetchVideosGroupItems(): Promise<VideosGroupItem[]> {
  const query = `query {
    boards(ids: [${BOARD_ID}]) {
      groups(ids: ["${VIDEOS_GROUP_ID}"]) {
        items_page(limit: 100) {
          items { id name column_values(ids: ["files1", "long_text", "long_text4"]) { id text value type } }
        }
      }
    }
  }`
  const data = await mondayQuery<VideosGroupResult>(query)
  const items = data.boards[0]?.groups[0]?.items_page.items ?? []
  const out: VideosGroupItem[] = []
  for (const item of items) {
    const byId = new Map(item.column_values.map((cv) => [cv.id, cv]))
    const filesCv = byId.get('files1')
    if (!filesCv?.value) continue
    const parsed = JSON.parse(filesCv.value) as { files?: Array<{ fileId?: string; fileType?: string }> }
    const file = parsed.files?.[0]
    if (file?.fileType !== 'GOOGLE_DRIVE' || !file.fileId) continue
    out.push({
      name: item.name,
      driveId: file.fileId,
      descEn: byId.get('long_text')?.text ?? '',
      descHe: byId.get('long_text4')?.text ?? '',
      mondayItemId: item.id,
    })
  }
  return out
}

export interface SyncResult {
  added: number
  renamed: number
  removed: number
  total: number
}

// Reconciles MondayTreeItem against the live board: adds new items, updates
// renamed/re-attached ones, deletes ones no longer in Monday. Deliberately
// does NOT digest content — turning a Monday item into a real, reviewed
// document stays the separate quality-gate step (the Import button /
// scripts/digestRevitDocs.ts) per the PRD's "semi-manual, not bulk import"
// stance; this only keeps the TREE — which topics exist, and whether they
// already link to a real digested document — in sync.
export async function syncMondayTree(): Promise<SyncResult> {
  await connectDB()
  const live = await fetchDocsGroupItems()
  const liveIds = new Set(live.map((i) => i.mondayItemId))

  const existing = await MondayTreeItem.find({ wsKey: WORKSPACE_ID, parentPath: PARENT_PATH })
  const byId = new Map(existing.map((e) => [e.mondayItemId, e]))

  // fetchDocsGroupItems defaults to [] on a malformed/empty Monday API
  // response (wrong group id, a transient partial response, ...) rather than
  // throwing — from here that's indistinguishable from "every tracked Docs
  // item was genuinely deleted in Monday". Wiping the tree's Docs section on
  // that ambiguity would silently empty it for every viewer until the next
  // successful sync, so treat an empty result against known-nonempty state
  // as a suspected transient failure and skip the delete step entirely.
  if (live.length === 0 && existing.length > 0) {
    return { added: 0, renamed: 0, removed: 0, total: existing.length }
  }

  let added = 0
  let renamed = 0
  for (const item of live) {
    const doc = await Document.findOne({ sourceDocId: item.fileId }, { status: 1 }).lean()
    const status = doc?.status === 'ready' ? 'done' : 'todo'
    const sourceId = doc?.status === 'ready' ? item.fileId : undefined

    const current = byId.get(item.mondayItemId)
    if (!current) {
      await MondayTreeItem.create({
        mondayItemId: item.mondayItemId,
        wsKey: WORKSPACE_ID,
        parentPath: PARENT_PATH,
        name: item.name,
        sourceId,
        status,
      })
      added++
    } else if (current.name !== item.name || current.sourceId !== sourceId || current.status !== status) {
      current.name = item.name
      current.sourceId = sourceId
      current.status = status
      await current.save()
      renamed++
    }
  }

  const toRemove = existing.filter((e) => !liveIds.has(e.mondayItemId))
  if (toRemove.length) {
    await MondayTreeItem.deleteMany({ _id: { $in: toRemove.map((e) => e._id) } })
  }

  return { added, renamed, removed: toRemove.length, total: live.length }
}
