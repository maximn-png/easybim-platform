import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
if ((v[0] === '"' && v.endsWith('"'))) v = v.slice(1, -1)
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
console.log('LOCAL SA email:', creds.client_email)
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })
const f = await drive.files.get({ fileId: '1P8gprLOc6XEoV2cZ3jyRTSMSdvTbKOFi', supportsAllDrives: true, fields: 'name,lastModifyingUser(emailAddress,displayName)' })
console.log('folder "514 - Test2" created/modified by:', JSON.stringify(f.data.lastModifyingUser))
