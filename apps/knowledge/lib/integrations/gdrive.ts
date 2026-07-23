// Google Drive client (OAuth, reuses the shared EasyBIM Google client).
//
//   import { getDrive } from '@/lib/integrations/gdrive'
//   const drive = getDrive()
//   const res = await drive.files.list({ pageSize: 10, supportsAllDrives: true })
//
// Credentials come from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and the
// GOOGLE_DRIVE_REFRESH_TOKEN (carries drive scope) — see .env.local.

import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google Drive env missing: need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN'
    )
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}

export function getDrive(): drive_v3.Drive {
  return google.drive({ version: 'v3', auth: getOAuthClient() })
}
