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
const CLIENTS_ROOT = process.env.PQ_CLIENTS_ROOT || 'Clients'
const TEMPLATE_ID = process.env.PQ_TEMPLATE_SHEET_ID || '1aKTp7HN1Y5plb6LBPdXEm16WV0Xt0-WNW7HWYPrlXXM'

export interface ClientFolder {
  id: string
  name: string
}

export interface ClientResolution {
  driveId: string
  clientsRootId: string
  match: ClientFolder | null
  candidates: ClientFolder[]
}

const norm = (s: string) =>
  s
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * Resolve the client folder under Clients/ by (fuzzy) name match against the
 * Monday client name. Returns the match (if any) plus all candidates so the
 * agent can decide / ask Maxim when there is no confident match.
 */
export async function resolveClientFolder(clientName: string): Promise<ClientResolution> {
  const driveId = await g.getSharedDriveId(DRIVE_NAME)
  const clientsRootId = await g.findChildFolder(driveId, CLIENTS_ROOT, driveId)
  if (!clientsRootId) {
    throw new Error(`Clients root '${CLIENTS_ROOT}' not found under Shared Drive '${DRIVE_NAME}'`)
  }
  const folders = await g.listChildFolders(clientsRootId, driveId)
  const target = norm(clientName)
  let match: g.DriveFile | undefined
  if (target) {
    match = folders.find((f) => norm(f.name) === target)
    if (!match) {
      match = folders.find((f) => {
        const n = norm(f.name)
        return n.includes(target) || target.includes(n)
      })
    }
  }
  return {
    driveId,
    clientsRootId,
    match: match ? { id: match.id, name: match.name } : null,
    candidates: folders.map((f) => ({ id: f.id, name: f.name })),
  }
}

/** Find the client folder under Clients/ by name, or CREATE it if missing. Never returns null. */
export async function ensureClientFolder(
  clientName: string
): Promise<{ id: string; name: string; created: boolean; driveId: string }> {
  const { driveId, clientsRootId, match } = await resolveClientFolder(clientName)
  if (match) return { id: match.id, name: match.name, created: false, driveId }
  const name = clientName.replace(/[\\/:*?"<>|]/g, '_').trim()
  const id = await g.createFolder(name, clientsRootId)
  return { id, name, created: true, driveId }
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
 * Full unattended plumbing for one Type-C project (idempotent). Creates
 *   <clientFolder>/<projectFolderName>/{הצעות מחיר, חוזה, חומר שהתקבל מהמזמין}
 * copies the Type-C Sheets template into הצעות מחיר (via SheetCopier so the
 * bound menu survives), writes the hidden _meta sheet, and downloads the Monday
 * attachments into חומר שהתקבל מהמזמין. Does NOT write Monday links (the caller
 * does that after, so a partial failure never leaves a dangling link).
 */
export async function setupProject(opts: {
  clientFolderId: string
  projectFolderName: string
  itemId: string
  assets: MondayAsset[]
  mondayToken: string
}): Promise<SetupResult> {
  const { clientFolderId, projectFolderName, itemId, assets, mondayToken } = opts
  const driveId = await g.getSharedDriveId(DRIVE_NAME)

  // Idempotency guard: if the project folder already exists, do not recreate.
  const existing = await g.findChildFolder(clientFolderId, projectFolderName, driveId)
  if (existing) {
    const quotesFolderId = (await g.findChildFolder(existing, QUOTES_SUBFOLDER, driveId)) ?? ''
    const materialsFolderId = (await g.findChildFolder(existing, MATERIALS_SUBFOLDER, driveId)) ?? ''
    return {
      projectFolderId: existing,
      folderUrl: g.folderUrl(existing),
      sheetFileId: '',
      sheetUrl: '',
      quotesFolderId,
      materialsFolderId,
      downloaded: 0,
      alreadyExisted: true,
    }
  }

  const projectFolderId = await g.createFolder(projectFolderName, clientFolderId)
  const subIds: Record<string, string> = {}
  for (const sub of SUBFOLDERS) subIds[sub] = await g.createFolder(sub, projectFolderId)

  // Copy the Type-C template into הצעות מחיר and register Monday meta for the bound script.
  const sheetName = `${projectFolderName} - תכנון עבודה`
  const { fileId: sheetFileId, link: sheetUrl } = await g.copySheetTemplate(
    TEMPLATE_ID,
    subIds[QUOTES_SUBFOLDER],
    sheetName
  )
  if (sheetFileId) {
    try {
      await g.writeMetaSheet(sheetFileId, itemId, BOARD_ID, mondayToken)
    } catch (e) {
      console.error('[squirrel] could not write _meta sheet:', e)
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
