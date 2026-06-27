// Google Drive API service (read-only). Resolves each project's Drive folder by
// matching the project number against subfolder names inside the "Projects"
// shared drive (or any parent folder).
//
// Auth — either of:
//   OAuth (preferred, reuses the existing EasyBIM client):
//     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN
//     (the refresh token must carry the drive.readonly scope)
//   Service account:
//     GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON or base64) with access to the folder
//
// Plus, in both cases:
//   GOOGLE_DRIVE_PARENT_FOLDER_ID — the parent to search in (the "Projects"
//     shared drive ID works here; its root id equals the shared-drive id).
// Not called until auth + parent are set (see driveEnabled()).

import { google, type drive_v3 } from 'googleapis'

function hasOAuth(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID
    && !!process.env.GOOGLE_CLIENT_SECRET
    && !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN
}

export function driveEnabled(): boolean {
  if (!process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID) return false
  return hasOAuth() || !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON
}

function loadServiceAccount(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!
  // Accept either raw JSON or base64-encoded JSON (handy for env-var storage).
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  return JSON.parse(json) as Record<string, unknown>
}

function getDriveClient(): drive_v3.Drive {
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
  if (hasOAuth()) {
    const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    oauth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
    return google.drive({ version: 'v3', auth: oauth })
  }
  const auth = new google.auth.GoogleAuth({ credentials: loadServiceAccount(), scopes: [DRIVE_SCOPE] })
  return google.drive({ version: 'v3', auth })
}

// Project folders are named "<number>_<name>" / "<number> <name>" etc. The folder
// must START with the project number followed by a non-digit, so "22117" matches
// "22117_Foo" but not "221170_Bar".
function isProjectFolder(name: string, num: string): boolean {
  if (!name.startsWith(num)) return false
  const after = name[num.length]
  return after === undefined || after < '0' || after > '9'
}

export interface DriveFolder {
  id:  string
  url: string
}

// For each project number, find the single subfolder of the parent folder whose
// name contains that number.
//   exactly one match → return it    zero / many → omit (caller keeps prior value)
export async function findProjectFolders(
  projectNumbers: string[],
): Promise<{ folders: Map<string, DriveFolder>; ambiguous: string[] }> {
  const parent = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID
  if (!parent) throw new Error('GOOGLE_DRIVE_PARENT_FOLDER_ID is not set')

  const drive = getDriveClient()
  const folders = new Map<string, DriveFolder>()
  const ambiguous: string[] = []

  for (const num of projectNumbers) {
    if (!num) continue
    const escaped = num.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const res = await drive.files.list({
      q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and name contains '${escaped}' and trashed=false`,
      fields: 'files(id,name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 20,
    })
    // Drive's `name contains` is a loose substring match — re-filter so the
    // folder actually starts with the project number (not just contains it).
    const matches = (res.data.files ?? []).filter(
      f => f.id && f.name && isProjectFolder(f.name, num),
    )
    if (matches.length === 1) {
      const id = matches[0].id!
      folders.set(num, { id, url: `https://drive.google.com/drive/folders/${id}` })
    } else if (matches.length > 1) {
      ambiguous.push(`${num} (${matches.length} folders)`)
    }
  }

  return { folders, ambiguous }
}
