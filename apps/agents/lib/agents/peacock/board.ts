// Peacock = the EasyBIM LinkedIn marketing agent.
// Resolved EasyBIM_Posts board constants (verified 2026-06-24) + typed helpers.
import {
  addFileToUpdate,
  changeColumnValues,
  createItem,
  createNotification,
  createUpdate,
  getItems,
  getItemsByStatusLabelIds,
  getUpdates,
} from '@/lib/integrations/monday/client'

export const BOARD_ID = '18419189644' // EasyBIM_Posts
export const POSTS_GROUP_ID = '________mkkf70xa'
export const MAXIM_USER_ID = '26773504'

export const COL = {
  status: 'status',
  postType: 'dropdown_mm05jq6f',
  publishDate: 'dup__of_start_mkm8svar',
  driveLink: 'link_mm4mqdp',
} as const

// Status label text (for writing) + label id (for filtering, which requires ids).
export const STATUS = {
  Idea: { label: 'Idea', id: 7 },
  Drafting: { label: 'Drafting', id: 9 },
  PendingApproval: { label: 'Pending Approval', id: 0 },
  Approved: { label: 'Approved', id: 3 },
  ReadyToPublish: { label: 'Ready to Publish', id: 4 },
  Scheduled: { label: 'Scheduled', id: 10 },
  Published: { label: 'Published', id: 1 },
  Revise: { label: 'Revise' }, // id assigned by board
} as const

// Board PostType taxonomy → brand-guide pillar.
export const POST_TYPES = [
  '1. Professional', // Thought Leadership
  '2. Client Connection',
  '3. New Employee', // New Hire
  '4. Project', // Case Study
  '5. Social', // Culture / office
  '6. Personal',
  '7. Other', // incl. Employer Branding
] as const

const ALL_COLS = [COL.status, COL.postType, COL.publishDate, COL.driveLink]

export async function getActiveBacklog() {
  return getItemsByStatusLabelIds(BOARD_ID, COL.status, [STATUS.Idea.id, STATUS.Drafting.id], ALL_COLS)
}

export async function getItemsInStatus(labelIds: number[]) {
  return getItemsByStatusLabelIds(BOARD_ID, COL.status, labelIds, ALL_COLS)
}

export async function readItem(itemId: string) {
  const items = await getItems([itemId], ALL_COLS)
  return items[0] ?? null
}

export async function setStatus(itemId: string, label: string) {
  await changeColumnValues(BOARD_ID, itemId, { [COL.status]: { label } })
}

export async function setPublishDate(itemId: string, isoDate: string) {
  // Set the date explicitly here (create_item dropped the day in testing) and read back to verify.
  await changeColumnValues(BOARD_ID, itemId, { [COL.publishDate]: { date: isoDate } })
}

export async function setPostType(itemId: string, postType: string) {
  await changeColumnValues(BOARD_ID, itemId, { [COL.postType]: { labels: [postType] } })
}

export async function setDriveLink(itemId: string, url: string, text = 'Package') {
  await changeColumnValues(BOARD_ID, itemId, { [COL.driveLink]: { url, text } })
}

export async function createPostItem(name: string, postType: string, publishDateIso: string) {
  const id = await createItem(BOARD_ID, POSTS_GROUP_ID, name, {
    [COL.status]: { label: STATUS.Drafting.label },
    [COL.postType]: { labels: [postType] },
  })
  await setPublishDate(id, publishDateIso) // set date separately + verify
  return id
}

export async function postDraftAndTag(itemId: string, bodyHtml: string, notifyText: string) {
  await createUpdate(itemId, bodyHtml)
  await createNotification(MAXIM_USER_ID, itemId, notifyText, 'Project')
}

export async function readUpdates(itemId: string, limit = 25) {
  return getUpdates(itemId, limit)
}

/** Post a branded image to the item Updates feed (a new update with the file attached). */
export async function postImageToUpdate(itemId: string, bytes: Buffer, caption: string) {
  const updateId = await createUpdate(itemId, caption)
  await addFileToUpdate(updateId, bytes, 'easybim-post.png')
  return updateId
}
