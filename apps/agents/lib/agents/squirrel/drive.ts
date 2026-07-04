// Squirrel's price-quote Drive orchestration, built on the shared Google client.
// Reproduces the folder layout + template copy + _meta sheet that the bound Apps
// Scripts (📄 הצעת מחיר, 📧 שליחה) depend on, so those menus keep working.
import * as g from '@/lib/integrations/google/client'
import { MondayAsset } from '@/lib/integrations/monday/client'
import { BOARD_ID } from './board'

export const SUBFOLDERS = ['הצעות מחיר', 'חוזה', 'חומר שהתקבל מהמזמין'] as const
export const QUOTES_SUBFOLDER = 'הצעות מחיר'
export const MATERIALS_SUBFOLDER = 'חומר שהתקבל מהמזמין'

const DRIVE_NAME = process.env.PQ_DRIVE_NAME || 'Finance'
// FLAT layout (2026-07-04 reorg): every project folder ("<מספר הצעה> - <name>")
// sits DIRECTLY under the "Price Quotes" root — there is no client layer anymore.
// Keyed by folder id so display renames (Clients → Price Quotes) never break it.
export const ROOT_FOLDER_ID = process.env.PQ_ROOT_FOLDER_ID || '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'

// Work-plan sheet templates per סוג פרויקט. Types without a template get folders only.
const TEMPLATE_C_ID = process.env.PQ_TEMPLATE_SHEET_ID || '1aKTp7HN1Y5plb6LBPdXEm16WV0Xt0-WNW7HWYPrlXXM'
const TEMPLATE_A_ID = process.env.PQ_TEMPLATE_SHEET_A_ID || '1sJZNxFu9d9hDignfgMs-1_TKZQtD4pVvpXepionpnlU'

export interface SheetTemplate {
  templateId: string
  /** Copy name = `${prefix} - ${projectFolderName}` */
  prefix: string
}

/** Template for a סוג פרויקט label, or null when the type has no work-plan template. */
export function templateForType(projectType: string | null | undefined): SheetTemplate | null {
  const t = (projectType ?? '').trim()
  if (t === 'C') return { templateId: TEMPLATE_C_ID, prefix: 'TYPE C - תכנון עבודה' }
  if (t === 'A' || t === 'A.1') return { templateId: TEMPLATE_A_ID, prefix: 'A-PlannedWork' }
  return null
}

export interface SetupResult {
  projectFolderId: string
  folderUrl: string
  sheetFileId: string
  sheetUrl: string
  quotesFolderId: string
  materialsFolderId: string
  downloaded: number
  alreadyExisted: boolean
}

/**
 * Full unattended plumbing for one project (idempotent). Creates
 *   <Price Quotes root>/<projectFolderName>/{הצעות מחיר, חוזה, חומר שהתקבל מהמזמין}
 * copies the type's Sheets template into הצעות מחיר (via SheetCopier so the
 * bound menu survives; skipped for types without a template), writes the hidden
 * _meta sheet, and downloads the Monday attachments into חומר שהתקבל מהמזמין.
 * Does NOT write Monday links (the caller does that after, so a partial failure
 * never leaves a dangling link).
 */
export async function setupProject(opts: {
  projectFolderName: string
  projectType: string | null
  itemId: string
  assets: MondayAsset[]
  mondayToken: string
}): Promise<SetupResult> {
  const { projectFolderName, projectType, itemId, assets, mondayToken } = opts
  const driveId = await g.getSharedDriveId(DRIVE_NAME)

  // Idempotency guard: if the project folder already exists, do not recreate —
  // but DO complete a missing work-plan template (a previous attempt may have
  // failed between folder creation and the template copy).
  const existing = await g.findChildFolder(ROOT_FOLDER_ID, projectFolderName, driveId)
  if (existing) {
    const quotesFolderId = (await g.findChildFolder(existing, QUOTES_SUBFOLDER, driveId)) ?? ''
    const materialsFolderId = (await g.findChildFolder(existing, MATERIALS_SUBFOLDER, driveId)) ?? ''
    let sheetFileId = ''
    let sheetUrl = ''
    const tpl = templateForType(projectType)
    if (tpl && quotesFolderId) {
      const sheets = await g.listFilesInFolder(quotesFolderId, 'application/vnd.google-apps.spreadsheet')
      if (sheets.length === 0) {
        const copied = await g.copySheetTemplate(tpl.templateId, quotesFolderId, `${tpl.prefix} - ${projectFolderName}`)
        sheetFileId = copied.fileId
        sheetUrl = copied.link
        if (sheetFileId) {
          try {
            await g.writeMetaSheet(sheetFileId, itemId, BOARD_ID, mondayToken)
          } catch (e) {
            console.error('[squirrel] could not write _meta sheet:', e)
          }
        }
      }
    }
    return {
      projectFolderId: existing,
      folderUrl: g.folderUrl(existing),
      sheetFileId,
      sheetUrl,
      quotesFolderId,
      materialsFolderId,
      downloaded: 0,
      alreadyExisted: true,
    }
  }

  const projectFolderId = await g.createFolder(projectFolderName, ROOT_FOLDER_ID)
  const subIds: Record<string, string> = {}
  for (const sub of SUBFOLDERS) subIds[sub] = await g.createFolder(sub, projectFolderId)

  // Copy the type's template into הצעות מחיר and register Monday meta for the bound script.
  const tpl = templateForType(projectType)
  let sheetFileId = ''
  let sheetUrl = ''
  if (tpl) {
    const sheetName = `${tpl.prefix} - ${projectFolderName}`
    const copied = await g.copySheetTemplate(tpl.templateId, subIds[QUOTES_SUBFOLDER], sheetName)
    sheetFileId = copied.fileId
    sheetUrl = copied.link
    if (sheetFileId) {
      try {
        await g.writeMetaSheet(sheetFileId, itemId, BOARD_ID, mondayToken)
      } catch (e) {
        console.error('[squirrel] could not write _meta sheet:', e)
      }
    }
  }

  // Download Monday update attachments → חומר שהתקבל מהמזמין (direct Drive upload).
  const materialsFolderId = subIds[MATERIALS_SUBFOLDER]
  let downloaded = 0
  for (const a of assets) {
    try {
      const src = a.public_url || a.url
      if (!src) continue
      // S3 pre-signed (public_url) must NOT carry an auth header; protected url needs the token.
      const bytes = await g.downloadUrlToBytes(src, a.public_url ? undefined : mondayToken)
      let name = a.name || 'file'
      if (a.file_extension && !name.toLowerCase().endsWith(`.${a.file_extension.toLowerCase()}`)) {
        name = `${name}.${a.file_extension}`
      }
      name = name.replace(/[\\/:*?"<>|]/g, '_')
      await g.uploadBytes(materialsFolderId, name, bytes)
      downloaded++
    } catch (e) {
      console.error(`[squirrel] could not download asset '${a.name}':`, e)
    }
  }

  return {
    projectFolderId,
    folderUrl: g.folderUrl(projectFolderId),
    sheetFileId,
    sheetUrl,
    quotesFolderId: subIds[QUOTES_SUBFOLDER],
    materialsFolderId,
    downloaded,
    alreadyExisted: false,
  }
}

export interface MaterialFile {
  id: string
  name: string
  mimeType: string
  text?: string
}

/**
 * List the received-client-materials for a project folder, with a best-effort
 * text extract for Google-native docs and plain-text files (a cap keeps it
 * cheap; binary PDFs/images are listed by name only for v1).
 */
export async function readReceivedMaterials(projectFolderId: string): Promise<MaterialFile[]> {
  const driveId = await g.getSharedDriveId(DRIVE_NAME)
  const materialsId = await g.findChildFolder(projectFolderId, MATERIALS_SUBFOLDER, driveId)
  if (!materialsId) return []
  const files = await g.listFilesInFolder(materialsId)

  const CAP = 6000
  const out: MaterialFile[] = []
  for (const f of files) {
    const file: MaterialFile = { id: f.id, name: f.name, mimeType: f.mimeType }
    try {
      if (f.mimeType.startsWith('application/vnd.google-apps.')) {
        file.text = (await g.exportGoogleFileText(f.id)).slice(0, CAP)
      } else if (f.mimeType.startsWith('text/')) {
        file.text = (await g.downloadDriveFile(f.id)).toString('utf-8').slice(0, CAP)
      }
    } catch (e) {
      console.error(`[squirrel] could not read material '${f.name}':`, e)
    }
    out.push(file)
  }
  return out
}
