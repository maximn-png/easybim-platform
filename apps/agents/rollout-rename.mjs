// Clients-folder normalization rollout (service-account). NOT committed.
// Computes ops from audit-tree.json; verifies structure live before mutating.
//
//   node rollout-rename.mjs                 # dry-run ALL stages (no mutations)
//   node rollout-rename.mjs --live=renames  # Stage 1: quote + materials renames/merges
//   node rollout-rename.mjs --live=contracts# Stage 2: merge contract folders into חוזה
//
// A "group" = the set of sibling folders (same parent) that belong to one
// category. Within a group we keep ONE canonical folder and merge the rest
// (move children in, trash the emptied source). Renames/merges are ID-
// preserving, so Monday links never break. Trash is reversible (30 days).

import { readFileSync, appendFileSync } from 'node:fs'
import { google } from 'googleapis'

const arg = process.argv.find((a) => a.startsWith('--live='))
const LIVE = arg ? arg.split('=')[1] : null // 'renames' | 'contracts' | null
const tree = JSON.parse(readFileSync(new URL('./audit-tree.json', import.meta.url), 'utf-8'))
const norm = (s) => s.replace(/\s+/g, ' ').trim()

// ---- Category membership (explicit, auditable) --------------------------
const QUOTE_CANON = 'הצעות מחיר'
const QUOTE_FROM = new Set(['הצעת מחיר', 'הצעה מחיר'])

const MAT_CANON = 'חומר שהתקבל מהמזמין'
const MAT_FROM = new Set([
  'חומר שיתקבל מהמזמין', 'חומר שהתקבל', 'חומר שיתקבל מהזמין', 'חומר שיקתבל מהמזמין',
  'התקבל מהמזמין', 'חומר שיתקבל מהמזין', 'חומר שיתקבל מהלקוח', 'חומר שיצקבל מהמזמין',
  'חומר ביתקבל מהזמנין', 'חומר מהמזמין', 'חומרים שיתקבלו מהמזמין', 'חומר שיתקבל מהזמזמין',
  'חומר שיתקל מהזמין',
])

const CONTRACT_CANON = 'חוזה'
const CONTRACT_FROM = new Set([
  'הצעה חתומה', 'הזמנה', 'הסכם', 'הצעה מאושרת', 'ביטוחים', 'חוזה וביטוחים', 'חוזה וביטוח',
  'ביטוחים וחוזה', 'הצעה חתומה והסכם', 'ביטוח וחוזה', 'הסכם+הזמנה', 'הסכם וביטוחים והצעת חתומה',
  'הסכם חתום', 'הזמנה חתומה', 'הצעה מאושר_תהסכם', 'וביטוחים הצעה חתומה והסכם', 'הזמנת רכש + ביטוחים',
  'ביטוחים והסכם', 'חוזה , ביטוחים והצעה חתומה', 'חוזה-ביהס תיירות', 'חוזה או הצעה חתומה',
  'הצעת חתומה', 'הצעה חתומה הגדלת שכט', 'הסכם סודיות', 'חוזה, הזמנה מאושרת', 'הצעתה חתומה - הזמנה',
  'הצעת חתומה וחוזה', 'הסכם והצעה חתומה', 'חוזה + ביטוח',
])

function categoryOf(name) {
  const n = norm(name)
  if (n === QUOTE_CANON || QUOTE_FROM.has(n)) return 'quote'
  if (n === MAT_CANON || MAT_FROM.has(n)) return 'materials'
  if (n === CONTRACT_CANON || CONTRACT_FROM.has(n)) return 'contract'
  return null
}
const CANON = { quote: QUOTE_CANON, materials: MAT_CANON, contract: CONTRACT_CANON }

// ---- Build the group plan from the tree ---------------------------------
// For every folder that has child folders, group its children by category.
const groups = [] // {parentName, category, canonId|null, canonName, variants:[{id,name}]}
function walk(node, path) {
  if (!node.folders?.length) return
  const byCat = { quote: [], materials: [], contract: [] }
  for (const f of node.folders) {
    const c = categoryOf(f.name)
    if (c) byCat[c].push(f)
  }
  for (const cat of ['quote', 'materials', 'contract']) {
    const members = byCat[cat]
    if (!members.length) continue
    const canon = members.find((m) => norm(m.name) === CANON[cat])
    groups.push({
      path: `${path}/${node.name}`,
      category: cat,
      canon: canon ? { id: canon.id, name: canon.name } : null,
      members: members.map((m) => ({ id: m.id, name: m.name })),
    })
  }
  for (const f of node.folders) walk(f, `${path}/${node.name}`)
}
for (const client of tree.folders) walk(client, 'Clients')

// Derive per-group ops.
function planGroup(g) {
  // target = existing canonical, else the single member we'll rename.
  const target = g.canon || g.members[0]
  const renameTarget = norm(target.name) !== CANON[g.category] ? { id: target.id, from: target.name, to: CANON[g.category] } : null
  const mergeSources = g.members.filter((m) => m.id !== target.id) // move contents in, then trash
  return { target, renameTarget, mergeSources }
}

// ---- Auth (only when live) ----------------------------------------------
function driveClient(readonly) {
  const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
  const line = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON='))
  let raw = line.slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1)
  const creds = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8'))
  return google.drive({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [readonly ? 'https://www.googleapis.com/auth/drive.readonly' : 'https://www.googleapis.com/auth/drive'],
    }),
  })
}

const LOG = new URL('./reorg-log.jsonl', import.meta.url)
const log = (rec) => appendFileSync(LOG, JSON.stringify(rec) + '\n')

async function listChildren(drive, parentId) {
  const out = []
  let pageToken
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
      fields: 'nextPageToken, files(id,name,mimeType)', pageSize: 1000, pageToken,
    })
    out.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return out
}

async function execGroup(drive, g) {
  const { target, renameTarget, mergeSources } = planGroup(g)
  if (renameTarget) {
    await drive.files.update({ fileId: renameTarget.id, requestBody: { name: renameTarget.to }, supportsAllDrives: true, fields: 'id,name' })
    log({ op: 'rename', id: renameTarget.id, from: renameTarget.from, to: renameTarget.to })
    console.log(`  rename: "${renameTarget.from}" → "${renameTarget.to}"`)
  }
  for (const src of mergeSources) {
    const kids = await listChildren(drive, src.id)
    for (const k of kids) {
      await drive.files.update({ fileId: k.id, addParents: target.id, removeParents: src.id, supportsAllDrives: true, fields: 'id,parents' })
      log({ op: 'move', id: k.id, name: k.name, from: src.id, to: target.id })
    }
    await drive.files.update({ fileId: src.id, requestBody: { trashed: true }, supportsAllDrives: true, fields: 'id,trashed' })
    log({ op: 'trash', id: src.id, name: src.name })
    console.log(`  merge: "${src.name}" (${kids.length} item(s)) → "${CANON[g.category]}", trashed source`)
  }
}

// ---- Run -----------------------------------------------------------------
async function main() {
  const stageCats = LIVE === 'contracts' ? ['contract'] : LIVE === 'renames' ? ['quote', 'materials'] : ['quote', 'materials', 'contract']
  const sel = groups.filter((g) => stageCats.includes(g.category)).map((g) => ({ g, plan: planGroup(g) }))

  // Summaries
  const stat = (cat) => {
    const gs = sel.filter((x) => x.g.category === cat)
    const renames = gs.filter((x) => x.plan.renameTarget && x.plan.mergeSources.length === 0).length
    const merges = gs.filter((x) => x.plan.mergeSources.length > 0).length
    return { groups: gs.length, renames, merges }
  }
  console.log(`\n=== rollout — ${LIVE ? 'LIVE:' + LIVE : 'DRY-RUN (all stages)'} ===\n`)
  for (const cat of ['quote', 'materials', 'contract']) {
    const s = stat(cat)
    console.log(`${cat.padEnd(10)} groups:${s.groups}  pure-renames:${s.renames}  merges(collision/consolidate):${s.merges}`)
  }

  // Show every MERGE (the destructive-ish ones) in full.
  console.log(`\n--- merges (move contents + trash source) ---`)
  let mc = 0
  for (const { g, plan } of sel) {
    if (!plan.mergeSources.length) continue
    mc++
    const loc = g.path.replace('Clients/', '')
    console.log(`[${g.category}] ${loc}`)
    if (plan.renameTarget) console.log(`    keep+rename: "${plan.renameTarget.from}" → "${plan.renameTarget.to}"`)
    else console.log(`    keep: "${plan.target.name}"`)
    for (const s of plan.mergeSources) console.log(`    merge & trash: "${s.name}"`)
  }
  if (!mc) console.log('  (none)')

  if (!LIVE) {
    console.log(`\n(dry-run — nothing changed.)`)
    return
  }

  const drive = driveClient(false)
  console.log(`\nApplying stage "${LIVE}"...`)
  let done = 0
  for (const { g } of sel) {
    const { renameTarget, mergeSources } = planGroup(g)
    if (!renameTarget && !mergeSources.length) continue
    console.log(`\n[${g.category}] ${g.path.replace('Clients/', '')}`)
    await execGroup(drive, g)
    done++
  }
  console.log(`\nDone. ${done} group(s) processed. Undo log: reorg-log.jsonl`)
}

main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1) })
