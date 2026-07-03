// Read-only audit of the Clients/ tree (service-account auth). NOT committed.
// Crawls Clients → client → project → subfolders, classifies each project,
// and writes: audit-tree.json (full tree) + audit-report.md (review doc).
// Mutates nothing.

import { readFileSync, writeFileSync } from 'node:fs'
import { google } from 'googleapis'

const CLIENTS_ROOT = '10Mf8vlNrOdBvi1WN9SpSpL5Wx_0-YpQy'
const DRIVE_ID = '0AMms_07jgU2PUk9PVA'
const STD = ['הצעות מחיר', 'חוזה', 'חומר שהתקבל מהמזמין']
const FOLDER = 'application/vnd.google-apps.folder'
const MAX_DEPTH = 4 // Clients=0, client=1, project=2, sub=3, subsub=4

function loadServiceAccountJson() {
  const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
  const line = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON='))
  if (!line) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not found in .env.local')
  let raw = line.slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
    raw = raw.slice(1, -1)
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  return JSON.parse(json)
}

const creds = loadServiceAccountJson()
const drive = google.drive({
  version: 'v3',
  auth: new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  }),
})

async function children(parentId) {
  const out = []
  let pageToken
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      driveId: DRIVE_ID,
      corpora: 'drive',
      fields: 'nextPageToken, files(id,name,mimeType)',
      pageSize: 1000,
      pageToken,
    })
    out.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return out
}

async function crawl(id, name, mimeType, depth) {
  const node = { id, name, mimeType, isFolder: mimeType === FOLDER, folders: [], files: [] }
  if (node.isFolder && depth < MAX_DEPTH) {
    const kids = await crawlChildren(id, depth + 1)
    node.folders = kids.filter((k) => k.isFolder)
    node.files = kids.filter((k) => !k.isFolder).map((k) => ({ id: k.id, name: k.name }))
  }
  return node
}

async function crawlChildren(parentId, depth) {
  const kids = await children(parentId)
  const nodes = []
  for (const k of kids) nodes.push(await crawl(k.id, k.name, k.mimeType, depth))
  return nodes
}

// Classify a project-level folder.
function classifyProject(proj) {
  const subNames = proj.folders.map((f) => f.name.trim())
  const stdPresent = STD.filter((s) => subNames.includes(s))
  const hasLooseFiles = proj.files.length > 0

  // Redundant wrapper: exactly one child folder, no loose files, and that inner
  // folder holds >=1 standard subfolder (the real project sits one level too deep).
  if (proj.folders.length === 1 && !hasLooseFiles) {
    const inner = proj.folders[0]
    const innerStd = STD.filter((s) => inner.folders.map((f) => f.name.trim()).includes(s))
    if (innerStd.length > 0)
      return { type: 'REDUNDANT_WRAPPER', detail: `unwrap "${inner.name}" up one level, trash "${proj.name}"`, inner }
  }

  if (stdPresent.length === 3) return { type: 'OK', detail: '' }
  if (stdPresent.length > 0)
    return { type: 'MISSING_SUBFOLDERS', detail: `missing: ${STD.filter((s) => !stdPresent.includes(s)).join(', ')}` }
  return { type: 'NO_STANDARD_SUBFOLDERS', detail: `folders: [${subNames.join(', ') || '—'}] files: ${proj.files.length}` }
}

function main() {
  return crawl(CLIENTS_ROOT, 'Clients', FOLDER, 0).then((tree) => {
    writeFileSync(new URL('./audit-tree.json', import.meta.url), JSON.stringify(tree, null, 2))

    const clients = tree.folders
    const lines = []
    const flags = { REDUNDANT_WRAPPER: [], MISSING_SUBFOLDERS: [], NO_STANDARD_SUBFOLDERS: [], TOP_LEVEL_PROJECT: [], OK: 0 }

    for (const client of clients) {
      // Is this top-level folder actually a misfiled PROJECT (holds a standard subfolder directly)?
      const clientSubNames = client.folders.map((f) => f.name.trim())
      const looksLikeProject = STD.some((s) => clientSubNames.includes(s))
      if (looksLikeProject) {
        flags.TOP_LEVEL_PROJECT.push(client.name)
        continue
      }
      for (const proj of client.folders) {
        const c = classifyProject(proj)
        if (c.type === 'OK') { flags.OK++; continue }
        flags[c.type].push(`${client.name} / ${proj.name} — ${c.detail}`)
      }
    }

    lines.push('# Clients folder audit\n')
    lines.push(`Clients: **${clients.length}**  ·  Projects OK: **${flags.OK}**\n`)
    lines.push(`Defects — wrapper: **${flags.REDUNDANT_WRAPPER.length}**, missing-subfolders: **${flags.MISSING_SUBFOLDERS.length}**, no-standard-subfolders: **${flags.NO_STANDARD_SUBFOLDERS.length}**, top-level-projects: **${flags.TOP_LEVEL_PROJECT.length}**\n`)

    const section = (title, arr) => {
      lines.push(`\n## ${title} (${arr.length})\n`)
      if (!arr.length) { lines.push('_none_\n'); return }
      for (const x of arr) lines.push(`- ${x}`)
      lines.push('')
    }
    section('Redundant wrapper — auto-fixable (unwrap + trash)', flags.REDUNDANT_WRAPPER)
    section('Missing subfolders — auto-fixable (create missing)', flags.MISSING_SUBFOLDERS)
    section('No standard subfolders — needs review', flags.NO_STANDARD_SUBFOLDERS)
    section('Top-level folders that look like PROJECTS, not clients — needs your rule', flags.TOP_LEVEL_PROJECT)

    writeFileSync(new URL('./audit-report.md', import.meta.url), lines.join('\n'))

    console.log(`Clients: ${clients.length} | OK projects: ${flags.OK}`)
    console.log(`wrapper: ${flags.REDUNDANT_WRAPPER.length} | missing-sub: ${flags.MISSING_SUBFOLDERS.length} | no-std: ${flags.NO_STANDARD_SUBFOLDERS.length} | top-level-project: ${flags.TOP_LEVEL_PROJECT.length}`)
    console.log('\nWrote audit-tree.json and audit-report.md')
  })
}

main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1) })
