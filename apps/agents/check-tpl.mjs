import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const d = (await drive.files.get({ fileId: '1mV67BGSpAFpjI4Qk5YPmqVNWB0NO2mdN', supportsAllDrives: true, fields: 'id,name,parents,trashed' })).data
console.log(JSON.stringify(d, null, 2))
if (d.parents?.[0]) {
  const p = (await drive.files.get({ fileId: d.parents[0], supportsAllDrives: true, fields: 'id,name' })).data
  console.log('parent:', p.name)
}
