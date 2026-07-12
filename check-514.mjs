import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"'))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const d = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
async function kids(pid, indent) {
  const r = await d.files.list({ q: `'${pid}' in parents and trashed = false`, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(id,name,mimeType)', pageSize: 100 })
  for (const f of r.data.files ?? []) {
    console.log(indent + f.name, f.mimeType.includes('folder') ? '[folder]' : '')
    if (f.mimeType.includes('folder')) await kids(f.id, indent + '   ')
  }
}
await kids('1P8gprLOc6XEoV2cZ3jyRTSMSdvTbKOFi', '')
