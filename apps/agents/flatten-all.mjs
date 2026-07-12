// FULL flatten (service-account). NOT committed.
// Target: Clients → only numbered project folders ("NNN - name") + "002 - Without
// Project Number" (holds leftover client folders) + 00.Template Folder + HQ.
//
//   node flatten-all.mjs          # dry-run (fresh crawl, prints full plan)
//   node flatten-all.mjs --live   # execute
//
// Rules (Maxim, 2026-07-04):
// - Every topmost folder named like "NNN - ..." (any depth under a client) moves
//   directly under Clients. No recursing INTO numbered folders.
// - After extraction: empty client folders → trash; non-empty (residue: non-
//   numbered projects, admin, loose files) → move under 002 (context preserved).
// - Moves preserve folder IDs → Monday GDrive links stay valid.

import { readFileSync, appendFileSync } from 'node:fs'
import { google } from 'googleapis'

const LIVE = process.argv.includes('--live')
const CLIENTS_ROOT = '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'
const DRIVE_ID = '0AMms_07jgU2PUk9PVA'
const FOLDER = 'application/vnd.google-apps.folder'
// Strict "NNN - name" / "NNN.N - name": whitespace REQUIRED around the dash so
// drawing codes like "5313-AS-001-CL-00 - Standard" don't false-match.
const NUMBERED = /^\d+(\.\d+)?\s+-\s+/
const KEEP = new Set(['00.Template Folder', 'HQ', '002 - Without Project Number'])
const P002_NAME = '002 - Without Project Number'
const LOG = new URL('./reorg-log.jsonl', import.meta.url)
const log = (r) => appendFileSync(LOG, JSON.stringify(r) + '\n')

const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
const sa = (() => { let v = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON=')).slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); return v })()
const creds = JSON.parse(sa.startsWith('{') ? sa : Buffer.from(sa, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] }) })

async function children(parentId) {
  const out = []; let t
  do {
    const r = await drive.files.list({ q: `'${parentId}' in parents and trashed = false`, supportsAllDrives: true, includeItemsFromAllDrives: true, driveId: DRIVE_ID, corpora: 'drive', fields: 'nextPageToken, files(id,name,mimeType)', pageSize: 1000, pageToken: t })
    out.push(...(r.data.files ?? [])); t = r.data.nextPageToken
  } while (t)
  return out
}
async function move(id, to, from) { await drive.files.update({ fileId: id, addParents: to, removeParents: from, supportsAllDrives: true, fields: 'id' }) }
async function trash(id) { await drive.files.update({ fileId: id, requestBody: { trashed: true }, supportsAllDrives: true, fields: 'id' }) }

// Recursively find topmost numbered folders under `parentId` (don't enter them).
// Depth-limited to 4 below the client to stay safe.
async function findNumbered(parentId, depth, found) {
  if (depth > 4) return
  for (const k of await children(parentId)) {
    if (k.mimeType !== FOLDER) continue
    if (NUMBERED.test(k.name.trim())) found.push({ id: k.id, name: k.name, parent: parentId })
    else await findNumbered(k.id, depth + 1, found)
  }
}

async function main() {
  console.log(`\n=== FULL FLATTEN — ${LIVE ? 'LIVE' : 'DRY-RUN'} ===\n`)
  const top = await children(CLIENTS_ROOT)
  const topFolders = top.filter((k) => k.mimeType === FOLDER)

  // Locate/create 002
  let p002 = topFolders.find((f) => f.name.trim() === P002_NAME)?.id ?? null
  if (!p002) {
    console.log(`002 folder missing → ${LIVE ? 'creating' : 'would create'} "${P002_NAME}"`)
    if (LIVE) {
      const r = await drive.files.create({ requestBody: { name: P002_NAME, mimeType: FOLDER, parents: [CLIENTS_ROOT] }, supportsAllDrives: true, fields: 'id' })
      p002 = r.data.id
      log({ op: 'create', id: p002, name: P002_NAME, parent: CLIENTS_ROOT })
    }
  }

  const clients = topFolders.filter((f) => !NUMBERED.test(f.name.trim()) && !KEEP.has(f.name.trim()))
  const alreadyTop = topFolders.length - clients.length
  console.log(`top-level folders: ${topFolders.length} | already numbered/special: ${alreadyTop} | client folders to process: ${clients.length}\n`)

  let extracted = 0, toKeep002 = 0, toTrash = 0
  for (const c of clients) {
    const found = []
    await findNumbered(c.id, 1, found)
    const rest = LIVE ? null : await children(c.id) // dry-run preview only
    console.log(`• ${c.name} — extract ${found.length} project(s)`)
    for (const f of found) console.log(`      ↑ ${f.name}`)
    if (LIVE) {
      for (const f of found) {
        await move(f.id, CLIENTS_ROOT, f.parent)
        log({ op: 'move', id: f.id, name: f.name, from: f.parent, to: CLIENTS_ROOT })
        extracted++
      }
      const left = await children(c.id)
      if (!left.length) {
        await trash(c.id); log({ op: 'trash', id: c.id, name: c.name })
        toTrash++; console.log(`      ✓ empty → trashed`)
      } else {
        await move(c.id, p002, CLIENTS_ROOT)
        log({ op: 'move', id: c.id, name: c.name, from: CLIENTS_ROOT, to: p002 })
        toKeep002++; console.log(`      → 002 (${left.length} leftover item(s))`)
      }
    } else {
      extracted += found.length
      // estimate leftover: children minus the numbered ones that are DIRECT children
      const directNums = new Set(found.filter((f) => f.parent === c.id).map((f) => f.id))
      const leftover = rest.filter((k) => !directNums.has(k.id))
      if (leftover.length) { toKeep002++; console.log(`      → 002 with leftovers: ${leftover.map((k) => k.name).join(', ')}`) }
      else { toTrash++; console.log(`      ✓ would be empty → trash`) }
    }
  }

  console.log(`\nsummary: projects moved up: ${extracted} | clients → 002: ${toKeep002} | clients trashed: ${toTrash}`)
  if (!LIVE) console.log('\n(dry-run — nothing changed.)')
  else console.log('\nDone. Undo log: reorg-log.jsonl')
}
main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1) })
