// Diagnose every item whose GDrive is still empty: for each source column that
// holds a Google id, report where it resolves (project / client / drive-root /
// not-found / external). Read-only. NOT committed.
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'

const BOARD_ID = '6105725242'
const SRCS = [['link_mm1hr4hg', 'קובץ הצעה 2'], ['files8', 'קובץ הצעה'], ['link_mm1ebc51', 'תכנון עבודה 2'], ['files9', 'תכנון עבודה']]
const DST = 'link_mm3wdkkz'
const DRIVE_ROOT = '0AMms_07jgU2PUk9PVA'
const CLIENTS_ROOT = '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'
const MONDAY_API = 'https://api.monday.com/v2'

const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
const getEnv = (k) => { let v = env.split(/\r?\n/).find((l) => l.startsWith(k + '=')).slice(k.length + 1).trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); return v }
const MT = getEnv('MONDAY_API_TOKEN')
const sa = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON')
const creds = JSON.parse(sa.startsWith('{') ? sa : Buffer.from(sa, 'base64').toString('utf-8'))
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }) })

async function monday(q, v = {}) {
  const r = await fetch(MONDAY_API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: MT, 'API-Version': '2024-10' }, body: JSON.stringify({ query: q, variables: v }) })
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data
}
const COLS = `column_values(ids: ${JSON.stringify(SRCS.map((s) => s[0]).concat(DST))}) { id text value }`
async function allItems() {
  const q1 = `query($b:ID!){boards(ids:[$b]){items_page(limit:200){cursor items{id name ${COLS}}}}}`
  const qn = `query($c:String!){next_items_page(cursor:$c,limit:200){cursor items{id name ${COLS}}}}`
  const out = []; let p = (await monday(q1, { b: BOARD_ID })).boards[0].items_page
  while (p) { out.push(...p.items); if (!p.cursor) break; p = (await monday(qn, { c: p.cursor })).next_items_page }
  return out
}
const col = (it, id) => it.column_values.find((c) => c.id === id)
const raw = (cv) => (cv ? [cv.text, cv.value].filter(Boolean).join(' ') : '')
function fileId(s) { if (!s) return null; let m = s.match(/\/(?:document|spreadsheets|presentation|file)\/d\/([\w-]{20,})/); if (m) return m[1]; m = s.match(/[?&]id=([\w-]{20,})/); if (m) return m[1]; m = s.match(/\/folders\/([\w-]{20,})/); return m ? m[1] : null }
const cache = new Map()
async function meta(id) { if (cache.has(id)) return cache.get(id); const d = (await drive.files.get({ fileId: id, supportsAllDrives: true, fields: 'id,name,parents' })).data; cache.set(id, d); return d }

async function resolve(id) {
  let doc; try { doc = await meta(id) } catch (e) { return e.message?.includes('not found') || e.message?.includes('File not found') ? 'FILE-NOT-FOUND' : 'ERR:' + e.message }
  let pid = doc.parents?.[0]
  if (pid === DRIVE_ROOT) return 'DRIVE-ROOT (loose, no folder)'
  const anc = []; let g = 0
  while (pid && pid !== CLIENTS_ROOT && pid !== DRIVE_ROOT && g++ < 12) { const n = await meta(pid); anc.push(n.name); pid = n.parents?.[0] }
  if (pid === DRIVE_ROOT) return `EXTERNAL (under drive, outside Clients): ${anc.slice(-1)[0] || doc.name}`
  if (pid !== CLIENTS_ROOT) return 'EXTERNAL/other'
  if (!anc.length) return 'CLIENTS-ROOT'
  const isC = (n) => /^פרויקטים\s/.test(n.trim())
  let i = anc.length - 2; if (i >= 1 && isC(anc[i])) i -= 1
  return `→ ${i >= 0 ? anc[i] : anc[anc.length - 1]}`
}

async function main() {
  const items = await allItems()
  const empty = items.filter((it) => { const d = col(it, DST); const u = d?.value ? (() => { try { return JSON.parse(d.value)?.url } catch { return null } })() : null; return !u })
  console.log(`Empty GDrive: ${empty.length}\n`)
  for (const it of empty) {
    const parts = []
    for (const [cid, label] of SRCS) {
      const id = fileId(raw(col(it, cid)))
      if (id) parts.push(`${label}: ${await resolve(id)}`)
    }
    console.log(`• ${it.name}\n    ${parts.length ? parts.join('\n    ') : '(no google link in any source column)'}`)
  }
}
main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1) })
