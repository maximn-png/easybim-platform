// Read-only scan for the "Project Number - Project Name" folder rename.
// Reads MA-001 items (name, numbers0=מספר הצעה, GDrive link), groups by target
// folder id, and reports: renameable, missing-number, conflicts (multiple items
// → same folder), and already-conforming names. NOT committed.
import { readFileSync, writeFileSync } from 'node:fs'

const BOARD_ID = '6105725242'
const NUM = 'numbers0'
const DST = 'link_mm3wdkkz'
const MONDAY_API = 'https://api.monday.com/v2'
const CLIENTS_ROOT = '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'

const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
const getEnv = (k) => { let v = env.split(/\r?\n/).find((l) => l.startsWith(k + '=')).slice(k.length + 1).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); return v }
const MT = getEnv('MONDAY_API_TOKEN')

async function monday(q, v = {}) {
  const r = await fetch(MONDAY_API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: MT, 'API-Version': '2024-10' }, body: JSON.stringify({ query: q, variables: v }) })
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data
}
const COLS = `column_values(ids: ["${NUM}","${DST}"]) { id text value }`
async function allItems() {
  const q1 = `query($b:ID!){boards(ids:[$b]){items_page(limit:200){cursor items{id name ${COLS}}}}}`
  const qn = `query($c:String!){next_items_page(cursor:$c,limit:200){cursor items{id name ${COLS}}}}`
  const out = []; let p = (await monday(q1, { b: BOARD_ID })).boards[0].items_page
  while (p) { out.push(...p.items); if (!p.cursor) break; p = (await monday(qn, { c: p.cursor })).next_items_page }
  return out
}
const col = (it, id) => it.column_values.find((c) => c.id === id)

const items = await allItems()
const byFolder = new Map() // folderId -> [{itemId,name,num,linkText}]
let noLink = 0
for (const it of items) {
  const d = col(it, DST)
  let url = null, text = null
  if (d?.value) { try { const j = JSON.parse(d.value); url = j?.url; text = j?.text } catch {} }
  if (!url) { noLink++; continue }
  const m = url.match(/\/folders\/([\w-]+)/)
  if (!m) { noLink++; continue }
  const numTxt = (col(it, NUM)?.text || '').trim()
  const rec = { itemId: it.id, name: it.name.trim(), num: numTxt, linkText: text }
  if (!byFolder.has(m[1])) byFolder.set(m[1], [])
  byFolder.get(m[1]).push(rec)
}

let single = 0, singleNoNum = 0
const conflicts = []
for (const [fid, recs] of byFolder) {
  if (recs.length === 1) { recs[0].num ? single++ : singleNoNum++ }
  else conflicts.push({ fid, recs })
}
console.log(`items: ${items.length} | no GDrive link: ${noLink} | distinct folders: ${byFolder.size}`)
console.log(`folders w/ single item + number: ${single}`)
console.log(`folders w/ single item, NO number: ${singleNoNum}`)
console.log(`folders w/ MULTIPLE items: ${conflicts.length}`)
console.log('\n--- multi-item folders (folder ← items) ---')
for (const c of conflicts) {
  console.log(`• ${c.recs[0].linkText || c.fid}`)
  for (const r of c.recs) console.log(`    - [${r.num || 'ללא מספר'}] ${r.name}`)
}
console.log('\n--- single-item folders missing מספר הצעה ---')
for (const [fid, recs] of byFolder) if (recs.length === 1 && !recs[0].num) console.log(`• ${recs[0].name}  (folder: ${recs[0].linkText || fid})`)
writeFileSync(new URL('./rename-scan.json', import.meta.url), JSON.stringify([...byFolder.entries()], null, 1))
