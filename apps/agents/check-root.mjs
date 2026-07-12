import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const root = (await drive.files.get({ fileId: '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy', supportsAllDrives: true, fields: 'id,name' })).data
console.log(`root: "${root.name}"`)
const out = []; let t
do {
  const r = await drive.files.list({ q: `'10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`, supportsAllDrives: true, includeItemsFromAllDrives: true, driveId: '0AMms_07jgU2PUk9PVA', corpora: 'drive', fields: 'nextPageToken, files(id,name)', pageSize: 1000, pageToken: t })
  out.push(...(r.data.files ?? [])); t = r.data.nextPageToken
} while (t)
const NUM = /^\d+(\.\d+)?\s+-\s+/
console.log(`children: ${out.length} | numbered: ${out.filter((f) => NUM.test(f.name.trim())).length}`)
console.log('NOT numbered:', out.filter((f) => !NUM.test(f.name.trim())).map((f) => f.name).join(' | ') || '(none)')
