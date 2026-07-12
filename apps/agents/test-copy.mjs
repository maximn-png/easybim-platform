import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
const get = (k) => { const l = env.split(/\r?\n/).find((l) => l.startsWith(k + '=')); if (!l) return ''; let v = l.slice(k.length + 1).trim(); if ((v[0] === '"' && v.endsWith('"'))) v = v.slice(1, -1); return v }
let v = get('GOOGLE_SERVICE_ACCOUNT_JSON')
const creds = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] }) })
const TPL = '1aKTp7HN1Y5plb6LBPdXEm16WV0Xt0-WNW7HWYPrlXXM'

// 1) SA metadata read
try {
  const m = await drive.files.get({ fileId: TPL, supportsAllDrives: true, fields: 'id,name,trashed' })
  console.log('SA read:', m.data.name, '| trashed:', m.data.trashed)
} catch (e) { console.log('SA read FAILED:', e.message) }

// 2) SA Drive copy into a scratch subfolder of the Price Quotes root
try {
  const c = await drive.files.copy({ fileId: TPL, requestBody: { name: '_copy-test-DELETE-ME', parents: ['10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'] }, supportsAllDrives: true, fields: 'id' })
  console.log('SA copy OK:', c.data.id)
  await drive.files.update({ fileId: c.data.id, requestBody: { trashed: true }, supportsAllDrives: true })
  console.log('(test copy trashed)')
} catch (e) { console.log('SA copy FAILED:', e.message) }

// 3) SheetCopier web app
const url = get('SHEET_COPIER_URL'), secret = get('SHEET_COPIER_SECRET')
if (url && secret) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, templateId: TPL, destFolderId: '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy', newName: '_sheetcopier-test-DELETE-ME' }) })
    const t = await r.text()
    console.log('SheetCopier raw (first 200):', t.slice(0, 200))
    try { const j = JSON.parse(t); if (j.fileId) { await drive.files.update({ fileId: j.fileId, requestBody: { trashed: true }, supportsAllDrives: true }); console.log('(sheetcopier copy trashed)') } } catch {}
  } catch (e) { console.log('SheetCopier FAILED:', e.message) }
} else console.log('SheetCopier env missing')
