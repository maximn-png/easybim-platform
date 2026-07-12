import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"'))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const d = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const r = await d.files.list({ q: "name = 'TYPE C - תכנון עבודה - 514 - בדיקת תבנית C' and trashed=false", supportsAllDrives: true, includeItemsFromAllDrives: true, driveId: '0AMms_07jgU2PUk9PVA', corpora: 'drive', fields: 'files(id)' })
const id = r.data.files?.[0]?.id
if (!id) { console.log('sheet not found'); process.exit(1) }
const f = await d.files.get({ fileId: id, supportsAllDrives: true, fields: 'name,lastModifyingUser(emailAddress,displayName)' })
console.log(f.data.name, '| lastModifiedBy:', JSON.stringify(f.data.lastModifyingUser))
// revisions show the original creator
const revs = await d.revisions.list({ fileId: id, fields: 'revisions(lastModifyingUser(emailAddress))' }).catch((e) => null)
if (revs) console.log('first revision by:', revs.data.revisions?.[0]?.lastModifyingUser?.emailAddress)
