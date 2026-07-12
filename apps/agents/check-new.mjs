import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"'))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const d = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const r = await d.files.list({ q: "name contains 'בדיקת תבנית C' and mimeType='application/vnd.google-apps.folder' and trashed=false", supportsAllDrives: true, includeItemsFromAllDrives: true, driveId: '0AMms_07jgU2PUk9PVA', corpora: 'drive', fields: 'files(id,name)' })
for (const f of r.data.files) {
  console.log('folder:', f.name)
  const subs = await d.files.list({ q: `'${f.id}' in parents and trashed=false`, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(id,name)' })
  for (const s of subs.data.files) {
    const kids = await d.files.list({ q: `'${s.id}' in parents and trashed=false`, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(name,lastModifyingUser(emailAddress))' })
    for (const k of kids.data.files) console.log('   •', k.name, '| by:', k.lastModifyingUser?.emailAddress)
  }
}
