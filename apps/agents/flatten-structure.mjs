// Structural pass (service-account). NOT committed.
//   1) BDO: unwrap the redundant "בית הספר עירוני ח' תל אביב" wrapper.
//   2) Ludan + Gabay: flatten status-group containers ("פרויקטים ...") — move each
//      contained project up to the client, then trash the emptied container.
// Moves preserve folder IDs, so GDrive links stay valid. Trash is reversible.
//
//   node flatten-structure.mjs          # dry-run
//   node flatten-structure.mjs --live   # execute

import { readFileSync, appendFileSync } from 'node:fs'
import { google } from 'googleapis'

const LIVE = process.argv.includes('--live')
const tree = JSON.parse(readFileSync(new URL('./audit-tree.json', import.meta.url), 'utf-8'))
const LOG = new URL('./reorg-log.jsonl', import.meta.url)
const log = (r) => appendFileSync(LOG, JSON.stringify(r) + '\n')

const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
const sa = (() => { let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); return v })()
const creds = JSON.parse(sa.startsWith('{') ? sa : Buffer.from(sa, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] }) })

const client = (name) => tree.folders.find((c) => c.name.trim() === name)
async function children(parentId) {
  const out = []; let t
  do {
    const r = await drive.files.list({ q: `'${parentId}' in parents and trashed = false`, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'nextPageToken, files(id,name,mimeType)', pageSize: 1000, pageToken: t })
    out.push(...(r.data.files ?? [])); t = r.data.nextPageToken
  } while (t)
  return out
}
async function move(id, to, from) { await drive.files.update({ fileId: id, addParents: to, removeParents: from, supportsAllDrives: true, fields: 'id' }) }
async function trash(id) { await drive.files.update({ fileId: id, requestBody: { trashed: true }, supportsAllDrives: true, fields: 'id' }) }

// Build the op list.
const containers = [] // {clientName, clientId, container:{id,name}}
for (const cName of ['Ludan', 'Gabay']) {
  const c = client(cName)
  if (!c) { console.log(`(client ${cName} not found)`); continue }
  for (const f of c.folders) if (/^פרויקטים\s/.test(f.name.trim())) containers.push({ clientName: cName, clientId: c.id, container: { id: f.id, name: f.name } })
}
// BDO wrapper
const bdo = client('BDO')
const wrapper = bdo?.folders.find((f) => f.name.trim() === 'בית הספר עירוני ח\' תל אביב')

async function run() {
  console.log(`\n=== flatten — ${LIVE ? 'LIVE' : 'DRY-RUN'} ===\n`)

  // 1) BDO unwrap
  if (wrapper) {
    const kids = await children(wrapper.id)
    console.log(`BDO: unwrap "${wrapper.name}" → move ${kids.length} item(s) up to BDO, trash wrapper`)
    for (const k of kids) console.log(`    • ${k.name}`)
    if (LIVE) {
      for (const k of kids) { await move(k.id, bdo.id, wrapper.id); log({ op: 'move', id: k.id, name: k.name, from: wrapper.id, to: bdo.id }) }
      const left = await children(wrapper.id)
      if (!left.length) { await trash(wrapper.id); log({ op: 'trash', id: wrapper.id, name: wrapper.name }); console.log('    ✓ unwrapped + trashed') }
      else console.log(`    ⚠ ${left.length} left, not trashed`)
    }
  } else console.log('BDO wrapper not found (skip)')

  // 2) Ludan/Gabay status-group flatten
  for (const { clientName, clientId, container } of containers) {
    const kids = await children(container.id)
    console.log(`\n${clientName}: flatten "${container.name}" → move ${kids.length} project(s) up to ${clientName}, trash container`)
    for (const k of kids) console.log(`    • ${k.name}`)
    if (LIVE) {
      for (const k of kids) { await move(k.id, clientId, container.id); log({ op: 'move', id: k.id, name: k.name, from: container.id, to: clientId }) }
      const left = await children(container.id)
      if (!left.length) { await trash(container.id); log({ op: 'trash', id: container.id, name: container.name }); console.log('    ✓ flattened + trashed') }
      else console.log(`    ⚠ ${left.length} left, not trashed`)
    }
  }

  if (!LIVE) console.log('\n(dry-run — nothing changed.)')
  else console.log('\nDone. Undo log: reorg-log.jsonl')
}
run().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1) })
