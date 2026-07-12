import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] }) })
await drive.files.update({ fileId: '1mV67BGSpAFpjI4Qk5YPmqVNWB0NO2mdN', requestBody: { trashed: false }, supportsAllDrives: true, fields: 'id,name,trashed' })
console.log('restored: 000-Templates & Standards (untrashed, back under Clients)')
