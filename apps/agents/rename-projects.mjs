// Rename project folders to "<מספר הצעה> - <item name>" from MA-001 board data,
// and update the Monday GDrive link text to match. NOT committed.
//
//   node rename-projects.mjs          # dry-run
//   node rename-projects.mjs --live   # rename folders + update link text
//
// Rules (per Maxim, 2026-07-04):
// - Folder ← item mapping comes from the GDrive column (link URL folder id).
// - Multi-item folders: the item with the LOWEST מספר הצעה (original quote) wins.
// - Items without מספר הצעה: skip folder, report.
// - Item names cleaned: strip Fwd:/Re: prefixes, leading colon/dash, collapse spaces.
// - Folder renames preserve IDs → links keep working. All ops → reorg-log.jsonl.

import { readFileSync, appendFileSync } from 'node:fs'
import { google } from 'googleapis'

const LIVE = process.argv.includes('--live')
const BOARD_ID = '6105725242'
const DST = 'link_mm3wdkkz'
const MONDAY_API = 'https://api.monday.com/v2'
const LOG = new URL('./reorg-log.jsonl', import.meta.url)
const log = (r) => appendFileSync(LOG, JSON.stringify(r) + '\n')

const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
const getEnv = (k) => { let v = env.split(/\r?\n/).find((l) => l.startsWith(k + '=')).slice(k.length + 1).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); return v }
const MT = getEnv('MONDAY_API_TOKEN')
const sa = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON')
const creds = JSON.parse(sa.startsWith('{') ? sa : Buffer.from(sa, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] }) })

async function monday(q, v = {}) {
  const r = await fetch(MONDAY_API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: MT, 'API-Version': '2024-10' }, body: JSON.stringify({ query: q, variables: v }) })
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data
}

// scan data: [folderId, [{itemId,name,num,linkText}]]
const scan = JSON.parse(readFileSync(new URL('./rename-scan.json', import.meta.url), 'utf-8'))

const clean = (s) => s
  .replace(/^\s*(fwd|re|fw)\s*:\s*/i, '')
  .replace(/^\s*(fwd|re|fw)\s*:\s*/i, '') // twice for "Fwd: FW:"
  .replace(/^[\s:־–-]+/, '')
  .replace(/\s+/g, ' ')
  .trim()

const plan = [], skipped = []
for (const [fid, recs] of scan) {
  const withNum = recs.filter((r) => r.num)
  if (!withNum.length) { skipped.push({ reason: 'no מספר הצעה', items: recs.map((r) => r.name) }); continue }
  // lowest number = original quote
  withNum.sort((a, b) => Number(a.num) - Number(b.num))
  const w = withNum[0]
  const target = `${w.num} - ${clean(w.name)}`
  plan.push({ fid, target, num: w.num, itemIds: recs.map((r) => r.itemId), multi: recs.length > 1 })
}

async function folderName(fid) {
  const d = (await drive.files.get({ fileId: fid, supportsAllDrives: true, fields: 'id,name' })).data
  return d.name
}

console.log(`\n=== rename projects — ${LIVE ? 'LIVE' : 'DRY-RUN'} ===`)
console.log(`folders in plan: ${plan.length} | skipped (no number): ${skipped.length}\n`)

let renamed = 0, already = 0, gone = 0, textUpdates = 0
const mut = `mutation ($b: ID!, $i: ID!, $c: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $c) { id } }`

for (const p of plan) {
  let current
  try { current = await folderName(p.fid) } catch { gone++; console.log(`  ⚠ folder ${p.fid} inaccessible — skip`); continue }
  if (current === p.target) { already++; continue }
  console.log(`  "${current}"  →  "${p.target}"${p.multi ? '   [multi-item]' : ''}`)
  if (LIVE) {
    await drive.files.update({ fileId: p.fid, requestBody: { name: p.target }, supportsAllDrives: true, fields: 'id,name' })
    log({ op: 'rename', id: p.fid, from: current, to: p.target })
    renamed++
    for (const itemId of p.itemIds) {
      const cols = JSON.stringify({ [DST]: { url: `https://drive.google.com/drive/folders/${p.fid}`, text: p.target } })
      await monday(mut, { b: BOARD_ID, i: itemId, c: cols })
      textUpdates++
    }
  } else renamed++
}

console.log(`\n${LIVE ? 'renamed' : 'would rename'}: ${renamed} | already conforming: ${already} | inaccessible: ${gone}${LIVE ? ` | monday link-text updates: ${textUpdates}` : ''}`)
if (skipped.length) {
  console.log(`\n--- skipped, no מספר הצעה (${skipped.length}) — add numbers in Monday, then re-run ---`)
  for (const s of skipped) console.log(`  • ${s.items.join(' | ')}`)
}
if (!LIVE) console.log('\n(dry-run — nothing changed.)')
