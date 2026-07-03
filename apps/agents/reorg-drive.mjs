// One-off Clients-folder reorg tool (service-account auth). NOT committed.
// Usage:
//   node reorg-drive.mjs           # verify access + dry-run (no mutations)
//   node reorg-drive.mjs --live    # perform the moves/trash
//
// Pilot client: הגבעה פרויקטים הנדסיים בעמ
//   Fix: unwrap the redundant "מגרש 300+306" level so the real project
//   "מגרש 300+306 אשקלון" sits directly under the client, then trash the
//   emptied wrapper. Trash is reversible (Drive trash), never a hard delete.

import { readFileSync } from 'node:fs'
import { google } from 'googleapis'

const LIVE = process.argv.includes('--live')

// --- Pilot operation set -------------------------------------------------
const CLIENT = { id: '1pEtkFj79Qanp5wD97HWvx-m7_j7AdFJO', name: 'הגבעה פרויקטים הנדסיים בעמ' }
const WRAPPER = { id: '15vnP-qMkETjyINIPS5t4COwtTTFUfbyL', name: 'מגרש 300+306' } // redundant level
const PROJECT = { id: '1RXfdTZuWKs8J_ftmFk8wK9Cv8LR6GP4x', name: 'מגרש 300+306 אשקלון' } // real project

// --- Auth (mirrors lib/integrations/google/client.ts) --------------------
function loadServiceAccountJson() {
  const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
  const line = env.split(/\r?\n/).find((l) => l.startsWith('GOOGLE_SERVICE_ACCOUNT_JSON='))
  if (!line) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not found in .env.local')
  let raw = line.slice('GOOGLE_SERVICE_ACCOUNT_JSON='.length).trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1)
  }
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
  return JSON.parse(json)
}

const creds = loadServiceAccountJson()
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

const listChildren = async (parentId) => {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id,name,mimeType)',
    pageSize: 500,
  })
  return res.data.files ?? []
}

async function main() {
  console.log(`\n=== Clients reorg — ${LIVE ? 'LIVE' : 'DRY-RUN'} ===`)
  console.log(`service account: ${creds.client_email}\n`)

  // 1) Verify write access on the project folder (capabilities).
  const meta = await drive.files.get({
    fileId: PROJECT.id,
    supportsAllDrives: true,
    fields: 'id,name,driveId,capabilities(canEdit,canMoveItemWithinDrive,canTrash)',
  })
  const cap = meta.data.capabilities ?? {}
  console.log(`project folder: "${meta.data.name}"  driveId=${meta.data.driveId}`)
  console.log(`capabilities: canEdit=${cap.canEdit} canMove=${cap.canMoveItemWithinDrive} canTrash=${cap.canTrash}`)
  const canMove = cap.canEdit && cap.canMoveItemWithinDrive
  if (!canMove) {
    console.log(
      `\n❌ Service account lacks move rights. Add ${creds.client_email} as a ` +
        `Content Manager on the "Finance" Shared Drive, then re-run.`
    )
    return
  }
  console.log('✅ Access OK.\n')

  // 2) Show the planned operations.
  const wrapperKids = await listChildren(WRAPPER.id)
  console.log('Planned operations:')
  console.log(`  1) MOVE  "${PROJECT.name}"  from "${WRAPPER.name}"  →  "${CLIENT.name}"`)
  console.log(`  2) TRASH "${WRAPPER.name}" (redundant wrapper), only if empty after the move`)
  console.log(`\n  wrapper currently holds ${wrapperKids.length} item(s): ` +
    wrapperKids.map((k) => k.name).join(', '))

  if (!LIVE) {
    console.log('\n(dry-run — nothing changed. Re-run with --live to apply.)')
    return
  }

  // 3) Execute.
  console.log('\nApplying...')
  await drive.files.update({
    fileId: PROJECT.id,
    addParents: CLIENT.id,
    removeParents: WRAPPER.id,
    supportsAllDrives: true,
    fields: 'id,parents',
  })
  console.log(`  ✓ moved "${PROJECT.name}" → "${CLIENT.name}"`)

  const remaining = await listChildren(WRAPPER.id)
  if (remaining.length === 0) {
    await drive.files.update({
      fileId: WRAPPER.id,
      requestBody: { trashed: true },
      supportsAllDrives: true,
      fields: 'id,trashed',
    })
    console.log(`  ✓ trashed empty wrapper "${WRAPPER.name}"`)
  } else {
    console.log(`  ⚠ wrapper still has ${remaining.length} item(s); NOT trashed. ` +
      remaining.map((k) => k.name).join(', '))
  }

  // 4) Verify final layout.
  const kids = await listChildren(CLIENT.id)
  console.log(`\nFinal — "${CLIENT.name}" now contains:`)
  for (const k of kids) console.log(`  • ${k.name}`)
}

main().catch((e) => {
  console.error('\nERROR:', e?.message || e)
  process.exit(1)
})
