import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"'))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const d = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const top = await d.files.list({ q: "'1P8gprLOc6XEoV2cZ3jyRTSMSdvTbKOFi' in parents and trashed=false", supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(id,name)' })
for (const f of top.data.files) {
  console.log(f.name)
  const k = await d.files.list({ q: `'${f.id}' in parents and trashed=false`, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(id,name,lastModifyingUser(emailAddress))' })
  for (const g of k.data.files) console.log('   •', g.name, '| by:', g.lastModifyingUser?.emailAddress ?? '?')
}
