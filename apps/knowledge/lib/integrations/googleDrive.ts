// Google Drive client (service account — metadata + raw file bytes for
// non-Google-Docs files linked from Monday's "Files" column: uploaded .docx,
// images, etc). Same credential and pattern as googleDocs.ts; separate file
// because it's a different API surface (drive/v3, not docs/v1).

import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

function credentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured')
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  return JSON.parse(json)
}

export function getDrive(): drive_v3.Drive {
  const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: SCOPES })
  return google.drive({ version: 'v3', auth })
}

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
}

export async function getDriveFileMeta(fileId: string): Promise<DriveFileMeta> {
  const res = await getDrive().files.get({
    fileId,
    fields: 'id,name,mimeType',
    supportsAllDrives: true,
  })
  return { id: res.data.id ?? fileId, name: res.data.name ?? fileId, mimeType: res.data.mimeType ?? '' }
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const res = await getDrive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data as ArrayBuffer)
}
