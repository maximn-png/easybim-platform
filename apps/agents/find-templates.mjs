import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"'))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const DRIVE_ID = '0AMms_07jgU2PUk9PVA'
async function kids(pid) {
  const r = await drive.files.list({ q: `'${pid}' in parents and trashed = false`, supportsAllDrives: true, includeItemsFromAllDrives: true, driveId: DRIVE_ID, corpora: 'drive', fields: 'files(id,name,mimeType)', pageSize: 200 })
  return r.data.files ?? []
}
// Walk: Price Quotes root → 001 - Templates & Standards → 02 - PQ Templates → both type folders
const ROOT = '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'
const l1 = await kids(ROOT)
const tpl = l1.find((f) => /Templates/.test(f.name))
console.log('L1:', tpl?.name, tpl?.id)
const l2 = await kids(tpl.id)
for (const f of l2) console.log('  L2:', f.name)
const pq = l2.find((f) => /PQ Templates/.test(f.name))
const l3 = await kids(pq.id)
for (const f of l3) {
  console.log('  L3:', f.name)
  if (f.mimeType === 'application/vnd.google-apps.folder') {
    for (const g of await kids(f.id)) console.log('      •', g.name, '|', g.mimeType.split('.').pop(), '|', g.id)
  }
}
