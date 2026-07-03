// Fill the Monday "GDrive" column from "קובץ הצעה 2" for MA-001-Price Quotes.
// For each item: parse the Google file id from קובץ הצעה 2, walk TWO folders up
// in Drive (doc → הצעות מחיר → project), and write that project folder's link
// into GDrive. Fills only empty GDrive cells. NOT committed.
//
//   node gdrive-batch.mjs         # dry-run (no Monday writes)
//   node gdrive-batch.mjs --live  # write the GDrive column

import { readFileSync, appendFileSync } from 'node:fs'
import { google } from 'googleapis'

const LIVE = process.argv.includes('--live')
const WORK_ONLY = process.argv.includes('--work-only') // resolve empties from תכנון עבודה 2 only
const RERESOLVE = process.argv.includes('--reresolve') // recompute ALL links, fix wrong ones

const norm = (s) => s.replace(/\s+/g, ' ').trim()
// Standard subfolders (canonical + legacy variants) — the project is their PARENT.
const CATEGORY = new Set([
  'הצעות מחיר', 'הצעת מחיר', 'הצעה מחיר',
  'חומר שהתקבל מהמזמין', 'חומר שיתקבל מהמזמין', 'חומר שהתקבל', 'חומר שיתקבל מהזמין',
  'חומר שיקתבל מהמזמין', 'התקבל מהמזמין', 'חומר שיתקבל מהמזין', 'חומר שיתקבל מהלקוח',
  'חומר שיצקבל מהמזמין', 'חומר ביתקבל מהזמנין', 'חומר מהמזמין', 'חומרים שיתקבלו מהמזמין',
  'חומר שיתקבל מהזמזמין', 'חומר שיתקל מהזמין', 'חוזה',
])
const BOARD_ID = '6105725242'
const SRC = 'link_mm1hr4hg'  // קובץ הצעה 2 (new method, link column)
const SRC2 = 'files8'        // קובץ הצעה (old method, file column — fallback)
const SRC3 = 'link_mm1ebc51' // תכנון עבודה 2 (link column — fallback)
const SRC4 = 'files9'        // תכנון עבודה (old file column — last fallback)
const DST = 'link_mm3wdkkz'  // GDrive
const MONDAY_API = 'https://api.monday.com/v2'
const CLIENTS_ROOT = '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy' // project must never resolve above this
const DRIVE_ROOT = '0AMms_07jgU2PUk9PVA' // Finance shared-drive root (loose files sit here)

// ---- env ----
const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
const getEnv = (k) => {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(k + '='))
  if (!line) throw new Error(`${k} not in .env.local`)
  let v = line.slice(k.length + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  return v
}
const MONDAY_TOKEN = getEnv('MONDAY_API_TOKEN')
const saRaw = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON')
const creds = JSON.parse(saRaw.startsWith('{') ? saRaw : Buffer.from(saRaw, 'base64').toString('utf-8'))
const drive = google.drive({
  version: 'v3',
  auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }),
})

async function monday(query, variables = {}) {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: MONDAY_TOKEN, 'API-Version': '2024-10' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`monday: ${JSON.stringify(json.errors)}`)
  return json.data
}

const COLS = `column_values(ids: ["${SRC}","${SRC2}","${SRC3}","${SRC4}","${DST}"]) { id text value }`
async function allItems() {
  const q1 = `query ($b: ID!) { boards(ids: [$b]) { items_page(limit: 200) { cursor items { id name ${COLS} } } } }`
  const qn = `query ($c: String!) { next_items_page(cursor: $c, limit: 200) { cursor items { id name ${COLS} } } }`
  const out = []
  let page = (await monday(q1, { b: BOARD_ID })).boards[0].items_page
  while (page) {
    out.push(...page.items)
    if (!page.cursor) break
    page = (await monday(qn, { c: page.cursor })).next_items_page
  }
  return out
}

const col = (item, id) => item.column_values.find((c) => c.id === id)
// Combine text + raw value so the id regex catches Google links regardless of
// column type (link column stores {url}, file column stores {files:[...]}).
const raw = (cv) => (cv ? [cv.text, cv.value].filter(Boolean).join(' ') : '')
function fileId(s) {
  if (!s) return null
  let m = s.match(/\/(?:document|spreadsheets|presentation|file)\/d\/([a-zA-Z0-9_-]{20,})/)
  if (m) return m[1]
  m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
  if (m) return m[1]
  m = s.match(/\/folders\/([a-zA-Z0-9_-]{20,})/)
  return m ? m[1] : null
}
const _cache = new Map()
async function meta(id) {
  if (_cache.has(id)) return _cache.get(id)
  const d = (await drive.files.get({ fileId: id, supportsAllDrives: true, fields: 'id,name,parents' })).data
  _cache.set(id, d)
  return d
}

const LOG = new URL('./gdrive-log.jsonl', import.meta.url)

async function main() {
  const items = await allItems()
  const plan = [], skipEmpty = [], skipFilled = [], flag = []

  for (const it of items) {
    const dst = col(it, DST)
    const dstUrl = dst?.value ? (() => { try { return JSON.parse(dst.value)?.url } catch { return null } })() : null
    // Normal/work-only: skip already-filled. Reresolve: process everything.
    if (dstUrl && !RERESOLVE) { skipFilled.push(it.name); continue }

    let id, via
    if (WORK_ONLY) {
      id = fileId(raw(col(it, SRC3))); via = 'תכנון עבודה 2'
      if (!id) { id = fileId(raw(col(it, SRC4))); via = 'תכנון עבודה' }
    } else {
      id = fileId(raw(col(it, SRC))); via = 'קובץ הצעה 2'
      if (!id) { id = fileId(raw(col(it, SRC2))); via = 'קובץ הצעה' }
      if (!id) { id = fileId(raw(col(it, SRC3))); via = 'תכנון עבודה 2' }
      if (!id) { id = fileId(raw(col(it, SRC4))); via = 'תכנון עבודה' }
    }
    if (!id) { if (!dstUrl) skipEmpty.push(it.name); continue }

    try {
      // Build the ancestor chain from the doc up to Clients root.
      const doc = await meta(id)
      const anc = []
      let pid = doc.parents?.[0]
      let guard = 0
      while (pid && pid !== CLIENTS_ROOT && pid !== DRIVE_ROOT && guard++ < 12) {
        const node = await meta(pid)
        anc.push({ id: node.id, name: node.name, parent: node.parents?.[0] })
        pid = node.parents?.[0]
      }
      if (pid !== CLIENTS_ROOT) { flag.push(`${it.name} — not under Clients/ (file lives elsewhere in Drive)`); continue }
      if (anc.length === 0) { flag.push(`${it.name} — doc sits directly in Clients root`); continue }
      // PROJECT = parent of the (lowest) standard subfolder on the path. This is
      // correct whether the project sits under a client, a status-group, or
      // directly under Clients. Fallback (doc not in a standard subfolder): the
      // child-of-client, skipping status-group containers.
      const ci = anc.findIndex((a) => CATEGORY.has(norm(a.name)))
      let target
      if (ci >= 0 && ci + 1 < anc.length) {
        target = anc[ci + 1]
      } else {
        const isContainer = (n) => /^פרויקטים\s/.test(n.trim())
        let i = anc.length - 2
        if (i >= 1 && isContainer(anc[i].name)) i -= 1
        target = i >= 0 ? anc[i] : anc[anc.length - 1]
      }
      const clientLevel = target.parent === CLIENTS_ROOT // project sits directly under Clients
      const url = `https://drive.google.com/drive/folders/${target.id}`
      if (RERESOLVE && dstUrl === url) { skipFilled.push(it.name); continue } // already correct
      plan.push({ id: it.id, name: it.name, project: target.name, src: via, clientLevel, was: dstUrl, url })
    } catch (e) {
      flag.push(`${it.name} — resolve error: ${e?.message || e}`)
    }
  }

  console.log(`\n=== GDrive batch — ${LIVE ? 'LIVE' : 'DRY-RUN'}${RERESOLVE ? ' (reresolve)' : ''} ===`)
  const clientLvl = plan.filter((p) => p.clientLevel)
  const fixes = plan.filter((p) => p.was)
  console.log(`items: ${items.length} | to ${RERESOLVE ? 'fix/fill' : 'fill'}: ${plan.length} | unchanged/already filled: ${skipFilled.length} | no link: ${skipEmpty.length} | flagged: ${flag.length}`)
  if (RERESOLVE) console.log(`of ${plan.length}: ${fixes.length} corrections to existing links, ${plan.length - fixes.length} newly filled\n`)
  console.log('--- planned writes (item → project folder) ---')
  for (const p of plan) console.log(`  ${p.clientLevel ? '[CLIENT-LVL]' : ''}${p.was ? '[FIX]' : ''} ${p.name}  →  ${p.project}`)
  if (flag.length) { console.log('\n--- flagged (skipped) ---'); for (const f of flag) console.log(`  ${f}`) }

  if (!LIVE) { console.log('\n(dry-run — no Monday writes.)'); return }

  console.log('\nWriting...')
  const mut = `mutation ($b: ID!, $i: ID!, $c: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $c) { id } }`
  let n = 0
  for (const p of plan) {
    const cols = JSON.stringify({ [DST]: { url: p.url, text: p.project } })
    await monday(mut, { b: BOARD_ID, i: p.id, c: cols })
    appendFileSync(LOG, JSON.stringify({ id: p.id, name: p.name, url: p.url, text: p.project }) + '\n')
    n++
  }
  console.log(`\nDone. Wrote GDrive on ${n} item(s). Log: gdrive-log.jsonl`)
}

main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1) })
