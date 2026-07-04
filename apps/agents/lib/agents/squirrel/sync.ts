// Squirrel's deterministic Monday↔Drive sync (no LLM). Every action is logged
// as an AgentRun (pass "sync" / "reconcile") so it shows on the Squirrel
// dashboard next to the agent runs.
//
// Monday is the source of truth:
// - new item        → clean the item name + auto-assign the next מספר הצעה
// - name/number change → rename the Drive project folder + refresh the GDrive link text
// - סוג פרויקט set (A/A.1) → create the project folder + A-PlannedWork template + links
//   (Type C keeps its richer LLM setup pass: materials + scope proposal)
// - nightly reconcile → sweep the board and fix any folder-name drift
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import * as g from '@/lib/integrations/google/client'
import * as board from './board'
import * as drive from './drive'
import { upsertOne } from './quoteIndex'

function mondayToken(): string {
  const t = process.env.MONDAY_API_TOKEN
  if (!t) throw new Error('MONDAY_API_TOKEN is not configured')
  return t
}

/** Persist a dashboard-visible run record for a deterministic sync action. */
async function logRun(
  pass: string,
  trigger: 'webhook' | 'cron',
  context: Record<string, unknown>,
  summary: string,
  error?: string
): Promise<void> {
  try {
    await connectDB()
    await AgentRun.create({
      agentKey: 'squirrel',
      pass,
      trigger,
      status: error ? 'error' : 'done',
      summary: summary.slice(0, 2000),
      error,
      context,
      startedAt: new Date(),
      finishedAt: new Date(),
    })
  } catch (e) {
    console.error('[squirrel sync] could not log run:', e)
  }
}

/**
 * New item on the board: clean the name (strip Fwd:/Re:) and assign the next
 * מספר הצעה when missing. Loop-safe: a clean name / existing number → no writes.
 */
export async function onItemCreated(itemId: string): Promise<void> {
  const item = await board.readQuoteItem(itemId)
  if (!item) return
  const actions: string[] = []

  const clean = board.cleanItemName(item.name)
  if (clean && clean !== item.name) {
    await board.renameItemOnBoard(itemId, clean)
    actions.push(`ניקוי שם: "${item.name}" → "${clean}"`)
  }

  if (!item.quoteNumber) {
    const next = await board.nextQuoteNumber()
    await board.setQuoteNumber(itemId, next)
    // Collision guard: if a racing item grabbed the same number, bump once.
    const check = await board.nextQuoteNumber()
    if (check === next + 1) {
      // ours is the max — fine
    } else if (check > next + 1) {
      await board.setQuoteNumber(itemId, check)
      actions.push(`מספר הצעה: ${check} (הוקצה מחדש אחרי התנגשות)`)
    }
    if (!actions.some((a) => a.startsWith('מספר הצעה'))) actions.push(`מספר הצעה: ${next}`)
  }

  if (actions.length) {
    await logRun('sync', 'webhook', { itemId, event: 'item_created' }, `🐿️ פריט חדש — ${actions.join(' · ')}`)
  }
}

/**
 * Name or מספר הצעה changed: clean the name if needed, and if the item already
 * has a GDrive folder — rename it to "<מספר> - <שם>" and refresh the link text.
 */
export async function onItemRenamedOrRenumbered(itemId: string): Promise<void> {
  const item = await board.readQuoteItem(itemId)
  if (!item) return
  const actions: string[] = []

  const clean = board.cleanItemName(item.name)
  if (clean && clean !== item.name) {
    await board.renameItemOnBoard(itemId, clean)
    item.name = clean
    actions.push(`ניקוי שם: "${clean}"`)
  }

  const folderId = item.gdriveLink ? g.parseFolderId(item.gdriveLink) : null
  if (folderId && item.quoteNumber) {
    const expected = board.folderName(item)
    await g.renameFile(folderId, expected)
    await board.setLink(itemId, board.COL.gdriveLink, g.folderUrl(folderId), expected)
    actions.push(`תיקייה סונכרנה: "${expected}"`)
  }

  if (actions.length) {
    await logRun('sync', 'webhook', { itemId, event: 'rename' }, `🐿️ סנכרון שם/מספר — ${actions.join(' · ')}`)
  }
}

/**
 * סוג פרויקט changed to A / A.1: deterministic folder setup (subfolders +
 * A-PlannedWork template + GDrive/sheet links + update + notify). Type C is
 * NOT handled here — the webhook keeps routing C to the LLM setup pass.
 */
export async function onTypeChanged(itemId: string): Promise<void> {
  const item = await board.readQuoteItem(itemId)
  if (!item) return
  const type = (item.projectType ?? '').trim()
  if (type !== 'A' && type !== 'A.1') return
  if (!item.quoteNumber || board.isAlreadySetUp(item)) return

  const projectFolderName = board.folderName(item)
  try {
    const assets = await board.getMaterialAssets(itemId)
    const result = await drive.setupProject({
      projectFolderName,
      projectType: type,
      itemId,
      assets,
      mondayToken: mondayToken(),
    })

    if (result.sheetUrl) {
      await board.setLink(itemId, board.COL.sheetLink, result.sheetUrl, `A-PlannedWork - ${projectFolderName}`)
    }
    await board.setLink(itemId, board.COL.gdriveLink, result.folderUrl, projectFolderName)

    await board.postUpdate(
      itemId,
      `<div dir="rtl">🐿️ הוקם פרויקט ${type}: <b>${projectFolderName}</b>.<br>` +
        `נוצרו 3 תיקיות${result.sheetUrl ? ', הועתקה תבנית A-PlannedWork' : ''}, ונאספו ${result.downloaded} קבצים.<br>` +
        `<a href="${result.folderUrl}">תיקיית הפרויקט</a>` +
        (result.sheetUrl ? ` · <a href="${result.sheetUrl}">גיליון תכנון עבודה</a>` : '') +
        `</div>`
    )
    await board.notifyMaxim(itemId, `🐿️ הוקם "${projectFolderName}" (סוג ${type}, ${result.downloaded} קבצים).`)
    try {
      await upsertOne(itemId)
    } catch (e) {
      console.error('[squirrel sync] index upsert failed:', (e as Error).message)
    }

    await logRun(
      'sync',
      'webhook',
      { itemId, event: 'type_setup', type },
      `🐿️ הוקם פרויקט ${type}: ${projectFolderName} (${result.alreadyExisted ? 'תיקייה קיימת' : 'נוצר'})`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'setup failed'
    await logRun('sync', 'webhook', { itemId, event: 'type_setup', type }, `הקמת ${projectFolderName} נכשלה`, msg)
  }
}

/**
 * Nightly reconcile: for every item with a number + GDrive link, verify the
 * Drive folder is named "<מספר> - <שם>"; rename + refresh link text on drift.
 * Also reports missing numbers and duplicate numbers. Logs one run record.
 */
export async function reconcileFolders(): Promise<{
  scanned: number
  renamed: number
  missingNumber: number
  duplicates: string[]
  errors: number
}> {
  const items = await board.readAllQuoteItems()
  const d = g.drive()

  let scanned = 0
  let renamed = 0
  let errors = 0
  const byNumber = new Map<string, string[]>()
  const missing = items.filter((it) => !it.quoteNumber)

  for (const it of items) {
    if (it.quoteNumber) {
      const key = String(Math.floor(Number(it.quoteNumber)))
      byNumber.set(key, [...(byNumber.get(key) ?? []), it.name])
    }
    const folderId = it.gdriveLink ? g.parseFolderId(it.gdriveLink) : null
    if (!folderId || !it.quoteNumber) continue
    scanned++
    try {
      const meta = await d.files.get({ fileId: folderId, supportsAllDrives: true, fields: 'id,name' })
      const expected = board.folderName(it)
      if ((meta.data.name ?? '') !== expected) {
        await g.renameFile(folderId, expected)
        await board.setLink(it.id, board.COL.gdriveLink, g.folderUrl(folderId), expected)
        renamed++
      }
    } catch (e) {
      errors++
      console.error(`[squirrel reconcile] item ${it.id} (${it.name}):`, (e as Error).message)
    }
  }

  const duplicates = [...byNumber.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([num, names]) => `${num}: ${names.join(' | ')}`)

  const summary =
    `🐿️ reconcile: ${scanned} נבדקו, ${renamed} תיקיות תוקנו, ${missing.length} ללא מספר` +
    (duplicates.length ? `, מספרים כפולים: ${duplicates.length}` : '') +
    (errors ? `, שגיאות: ${errors}` : '')
  await logRun('reconcile', 'cron', { renamed, duplicates }, summary)

  return { scanned, renamed, missingNumber: missing.length, duplicates, errors }
}
