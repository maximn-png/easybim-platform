/**
 * One-off / rerunnable: digest the Monday "Revit" board's "Docs" group into
 * MongoDB (see the approved plan / design_handoff_knowledge_center_backend
 * spec — this is the R1.3 "Documents" slice, scoped to this one board+group).
 *
 * Per PRD section 8 ("semi-manual quality gate, not bulk import") and the
 * README's R1.3 acceptance criteria ("validate against the hardest real
 * document early — not the easiest"), this runs in two phases:
 *
 *   npx tsx --env-file=.env.local scripts/digestRevitDocs.ts validate
 *     -> digests ONLY the two hardest real documents (most figures / Hebrew
 *        + many figures) and prints their full issue list for a human check.
 *
 *   npx tsx --env-file=.env.local scripts/digestRevitDocs.ts all
 *     -> digests every remaining linked document, writes each digested
 *        figure out as a static file under public/kc/assets/docpage/
 *        (kc-docpage.js's figSrc() hardcodes that path as a literal string —
 *        it never calls an API — so figures must land as real files, exactly
 *        like the existing Project Startup demo images; they are NOT stored
 *        in MongoDB, see lib/kc/digest.ts for why), then regenerates the
 *        "Docs" array inside public/kc/kc-data.js from real Monday titles/
 *        order + real status.
 */
import path from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import dns from 'node:dns'
import mongoose from 'mongoose'

// This network's default DNS resolver can't answer SRV queries (needed for
// mongodb+srv:// URIs) — same issue the app's own /api/health surfaces.
// Google's resolver handles it fine; force it for this process only.
dns.setServers(['8.8.8.8'])
import { connectDB } from '../lib/db/mongoose'
import { digestBySourceId } from '../lib/kc/digest'
import { fetchDocsGroupItems } from '../lib/kc/mondaySync'
import Document from '../lib/models/Document'

const WORKSPACE_ID = 'ws1'
const KC_DATA_PATH = path.join(__dirname, '..', 'public', 'kc', 'kc-data.js')
const FIGURES_DIR = path.join(__dirname, '..', 'public', 'kc', 'assets', 'docpage')

// The two documents that must validate cleanly before the rest run, per the
// spec's explicit instruction — not the easiest case, the hardest ones.
const VALIDATION_FIRST = ['DXXXX-Diroots Guide', 'DXXXX - איפה האלמנטים שלי']

async function digestOne(item: { name: string; fileId: string }) {
  let record = await Document.findOne({ sourceDocId: item.fileId })
  if (!record) {
    record = await Document.create({ sourceDocId: item.fileId, workspaceId: WORKSPACE_ID, title: item.name, status: 'importing' })
  }
  const result = await digestBySourceId(item.fileId, record._id, item.name)
  if (!result.ok) {
    record.status = 'error'
    record.errorMessage = result.errorMessage
    await record.save()
    console.log(`  ERROR   ${item.name}: ${result.errorMessage}`)
    return { ok: false as const }
  }
  record.title = result.title
  record.series = record.series || 'Revit'
  record.status = 'ready'
  record.blocks = result.blocks
  record.toc = result.toc
  record.versionHistory = result.versionHistory
  record.digestIssues = result.digestIssues
  record.importedAt = new Date()
  record.version = (record.version ?? 0) + 1
  await record.save()
  const issueSummary = result.digestIssues.length ? ` — ${result.digestIssues.length} issue(s)` : ''
  console.log(`  ready   ${item.name}${issueSummary}`)
  if (result.digestIssues.length) {
    for (const issue of result.digestIssues) console.log(`            [${issue.code}] block #${issue.at}: ${issue.detail}`)
  }
  // kc-docpage.js's figSrc() hardcodes a literal `assets/docpage/<id>.png`
  // path — it never calls an API — so figures land as real static files,
  // not in Mongo (see lib/kc/digest.ts for the full reasoning).
  mkdirSync(FIGURES_DIR, { recursive: true })
  for (const fig of result.figures) {
    writeFileSync(path.join(FIGURES_DIR, `${fig.id}.png`), fig.data)
  }
  return { ok: true as const, figureCount: result.figures.length }
}

function jsStringLiteral(s: string): string {
  return JSON.stringify(s)
}

async function regenerateKcData(items: Array<{ name: string; fileId: string; mondayItemId: string }>) {
  const fs = await import('node:fs')
  const src = fs.readFileSync(KC_DATA_PATH, 'utf8')

  const docs = await Document.find({ sourceDocId: { $in: items.map(i => i.fileId) } }).lean()
  const byFileId = new Map(docs.map(d => [d.sourceDocId, d]))

  const lines: string[] = []
  lines.push('/* GENERATED:START — from Monday board "Revit" > "Docs" via scripts/digestRevitDocs.ts. Do not hand-edit; rerun the script instead. */')
  for (const item of items) {
    const doc = byFileId.get(item.fileId)
    const status = doc?.status
    const comment = ` /* mondayItemId: ${item.mondayItemId} */`
    if (status === 'ready') {
      lines.push(`        {n:${jsStringLiteral(item.name)}, s:"done", doc:${jsStringLiteral(item.fileId)}},${comment}`)
    } else {
      lines.push(`        {n:${jsStringLiteral(item.name)}},${comment}`)
    }
  }
  lines.push('        /* GENERATED:END */')
  const generatedBlock = lines.join('\n')

  const startMarker = '["Docs", ['
  const startIdx = src.indexOf(startMarker)
  if (startIdx === -1) throw new Error('Could not find ["Docs", [ in kc-data.js')
  const arrayContentStart = startIdx + startMarker.length
  const endMarker = '\n      ]],\n      ["Videos"'
  const endIdx = src.indexOf(endMarker, arrayContentStart)
  if (endIdx === -1) throw new Error('Could not find the end of the Docs array in kc-data.js')

  const next = src.slice(0, arrayContentStart) + '\n' + generatedBlock + src.slice(endIdx)
  fs.writeFileSync(KC_DATA_PATH, next, 'utf8')
  console.log(`\nRegenerated kc-data.js: ${items.length} Docs entries (${docs.filter(d => d.status === 'ready').length} ready).`)
}

async function main() {
  const mode = process.argv[2]
  if (mode !== 'validate' && mode !== 'all') {
    console.error('Usage: tsx scripts/digestRevitDocs.ts <validate|all>')
    process.exit(1)
  }

  await connectDB()
  console.log('Connected to MongoDB.')

  const items = await fetchDocsGroupItems()
  console.log(`Monday: ${items.length} items in "Docs" carry a Google Drive file.\n`)

  if (mode === 'validate') {
    const targets = items.filter(i => VALIDATION_FIRST.some(name => i.name.includes(name) || name.includes(i.name)))
    console.log(`Validating ${targets.length} of ${VALIDATION_FIRST.length} target document(s):`)
    for (const item of targets) {
      console.log(`\n=== ${item.name} (${item.fileId}) ===`)
      await digestOne(item)
    }
    await mongoose.disconnect()
    return
  }

  console.log('Digesting all documents...')
  let readyCount = 0, errorCount = 0, figureCount = 0
  for (const item of items) {
    const res = await digestOne(item)
    if (res.ok) { readyCount++; figureCount += res.figureCount } else errorCount++
  }
  console.log(`\nDigest done: ${readyCount} ready, ${errorCount} error, ${figureCount} figures written.`)

  await regenerateKcData(items)
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
