// Generic Google Drive + Sheets integration (cross-agent, service-account auth).
// Ported from the PriceQuotes Python automation (monday_workflow.py). Board/agent
// specifics live in each agent's module (see lib/agents/squirrel/drive.ts).
//
// Auth: a Google service-account key, provided as GOOGLE_SERVICE_ACCOUNT_JSON
// (raw JSON or base64). Scopes: drive + spreadsheets. No browser/OAuth flow.

import { google, docs_v1 } from 'googleapis'
import { Readable } from 'stream'

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents.readonly',
]

function credentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured')
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  return JSON.parse(json)
}

function auth() {
  return new google.auth.GoogleAuth({ credentials: credentials(), scopes: SCOPES })
}

export function drive() {
  return google.drive({ version: 'v3', auth: auth() })
}

export function sheets() {
  return google.sheets({ version: 'v4', auth: auth() })
}

export function docs() {
  return google.docs({ version: 'v1', auth: auth() })
}

function docCellText(cell: docs_v1.Schema$TableCell): string {
  let t = ''
  for (const el of cell.content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      if (pe.textRun?.content) t += pe.textRun.content
    }
  }
  return t.replace(/\s+/g, ' ').trim()
}

export interface DocContent {
  title: string
  tables: string[][][] // [table][row][cell]
}

/** Read a Google Doc's tables as structured rows/cells (via the Docs API — preserves table structure). */
export async function getDocTables(docId: string): Promise<DocContent> {
  const res = await docs().documents.get({ documentId: docId })
  const doc = res.data
  const tables: string[][][] = []
  for (const c of doc.body?.content ?? []) {
    if (!c.table) continue
    const rows = (c.table.tableRows ?? []).map((r) => (r.tableCells ?? []).map(docCellText))
    tables.push(rows)
  }
  return { title: doc.title ?? '', tables }
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink?: string | null
}

/** Resolve a Shared Drive id by its display name (e.g. "Finance"). */
export async function getSharedDriveId(name: string): Promise<string> {
  const res = await drive().drives.list({ pageSize: 100, fields: 'drives(id,name)' })
  const d = (res.data.drives ?? []).find((x) => x.name === name)
  if (!d?.id) {
    const names = (res.data.drives ?? []).map((x) => x.name)
    throw new Error(`Shared Drive '${name}' not found. Available: ${JSON.stringify(names)}`)
  }
  return d.id
}

/** Find a direct child folder by name under a parent (returns its id or null). */
export async function findChildFolder(
  parentId: string,
  name: string,
  driveId: string
): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'")
  const res = await drive().files.list({
    q: `name = '${safe}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    driveId,
    corpora: 'drive',
    fields: 'files(id,name)',
  })
  return res.data.files?.[0]?.id ?? null
}

/** List all direct child folders under a parent. */
export async function listChildFolders(parentId: string, driveId: string): Promise<DriveFile[]> {
  const res = await drive().files.list({
    q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    driveId,
    corpora: 'drive',
    fields: 'files(id,name,mimeType)',
    pageSize: 500,
  })
  return (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name!, mimeType: f.mimeType! }))
}

/** List files inside a folder (optionally filtered by mimeType). */
export async function listFilesInFolder(folderId: string, mimeType?: string): Promise<DriveFile[]> {
  let q = `'${folderId}' in parents and trashed = false`
  if (mimeType) q += ` and mimeType = '${mimeType}'`
  const res = await drive().files.list({
    q,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id,name,mimeType,webViewLink)',
    pageSize: 500,
  })
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    webViewLink: f.webViewLink,
  }))
}

/** Move a file/folder to a new parent (Shared-Drive safe). */
export async function moveFile(
  fileId: string,
  newParentId: string,
  oldParentId: string
): Promise<void> {
  await drive().files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParentId,
    supportsAllDrives: true,
    fields: 'id,parents',
  })
}

/** Rename a file/folder. */
export async function renameFile(fileId: string, name: string): Promise<void> {
  await drive().files.update({
    fileId,
    requestBody: { name },
    supportsAllDrives: true,
    fields: 'id,name',
  })
}

/** Send a file/folder to the Drive trash. Reversible — not a permanent delete. */
export async function trashFile(fileId: string): Promise<void> {
  await drive().files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
    fields: 'id,trashed',
  })
}

export async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await drive().files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    supportsAllDrives: true,
    fields: 'id',
  })
  return res.data.id!
}

/**
 * Copy a Google Sheets template into a folder. Prefer the SheetCopier.gs web app
 * (SHEET_COPIER_URL + SHEET_COPIER_SECRET) so the copy runs under a real Google
 * user and the bound Apps Script (the "📄 הצעת מחיר" menu) keeps working. Falls
 * back to a Drive-API copy (bound script would then be service-account-owned).
 */
export async function copySheetTemplate(
  templateId: string,
  destFolderId: string,
  newName: string
): Promise<{ fileId: string; link: string }> {
  const url = (process.env.SHEET_COPIER_URL ?? '').trim()
  const secret = (process.env.SHEET_COPIER_SECRET ?? '').trim()

  if (url && secret) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, templateId, destFolderId, newName }),
    })
    const result = (await resp.json()) as { error?: string; fileId?: string; webViewLink?: string }
    if (result.error) throw new Error(`SheetCopier error: ${result.error}`)
    const fileId = result.fileId ?? ''
    const link =
      result.webViewLink ??
      (fileId ? `https://docs.google.com/spreadsheets/d/${fileId}/edit` : '')
    return { fileId, link }
  }

  const res = await drive().files.copy({
    fileId: templateId,
    requestBody: { name: newName, parents: [destFolderId] },
    supportsAllDrives: true,
    fields: 'id,webViewLink',
  })
  const fileId = res.data.id ?? ''
  return {
    fileId,
    link: res.data.webViewLink ?? (fileId ? `https://docs.google.com/spreadsheets/d/${fileId}/edit` : ''),
  }
}

/** Add a hidden _meta sheet with [itemId, boardId, token] so the bound Apps Script can update Monday. */
export async function writeMetaSheet(
  fileId: string,
  itemId: string,
  boardId: string,
  mondayToken: string
): Promise<void> {
  const s = sheets()
  await s.spreadsheets.batchUpdate({
    spreadsheetId: fileId,
    requestBody: { requests: [{ addSheet: { properties: { title: '_meta', hidden: true } } }] },
  })
  await s.spreadsheets.values.update({
    spreadsheetId: fileId,
    range: '_meta!A1:C1',
    valueInputOption: 'RAW',
    requestBody: { values: [[String(itemId), String(boardId), mondayToken]] },
  })
}

/** Upload raw bytes as a new file in a Drive folder. */
export async function uploadBytes(
  folderId: string,
  name: string,
  bytes: Buffer,
  mimeType = 'application/octet-stream'
): Promise<string> {
  const res = await drive().files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(bytes) },
    supportsAllDrives: true,
    fields: 'id',
  })
  return res.data.id!
}

/** Download a URL to a Buffer. Pass mondayToken only for protected (non-public) Monday urls. */
export async function downloadUrlToBytes(url: string, mondayToken?: string): Promise<Buffer> {
  const res = await fetch(url, mondayToken ? { headers: { Authorization: mondayToken } } : undefined)
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

/** Export a Google-native doc (Doc/Sheet) as plain text. */
export async function exportGoogleFileText(fileId: string): Promise<string> {
  const res = await drive().files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' }
  )
  return String(res.data ?? '')
}

/** Download a binary Drive file (e.g. an uploaded .txt) as a Buffer. */
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const res = await drive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data as ArrayBuffer)
}

export function folderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}

/** Parse a Drive folder id from a folder URL. */
export function parseFolderId(url: string): string | null {
  const m = url.match(/folders\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

/** Parse a Google Sheets file id from a spreadsheet URL. */
export function parseSheetId(url: string): string | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

/** Parse a Google Docs file id from a document URL. */
export function parseDocId(url: string): string | null {
  const m = url.match(/document\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

/** The tab titles of a spreadsheet. */
export async function getSheetTitles(spreadsheetId: string): Promise<string[]> {
  const res = await sheets().spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
  return (res.data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean)
}

/** Read a tab/range's formatted cell values as a 2-D string grid. */
export async function getSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  return (res.data.values ?? []) as string[][]
}
