/**
 * Rerunnable: pull the Monday "Revit" board's "Videos" group into
 * public/kc/kc-data.js. Sibling of digestRevitDocs.ts, but far simpler —
 * each item's files1 column is a Google Drive *video* file, not a Google
 * Doc, so there's no content to digest into blocks/figures; the drive file
 * id plus the board's own English/Hebrew description columns are all the
 * video page (kc-app.js's openVideoPage) needs.
 *
 *   npx tsx --env-file=.env.local scripts/digestRevitVideos.ts
 */
import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { fetchVideosGroupItems } from '../lib/kc/mondaySync'

const KC_DATA_PATH = path.join(__dirname, '..', 'public', 'kc', 'kc-data.js')

function jsStringLiteral(s: string): string {
  return JSON.stringify(s)
}

function regenerateKcData(items: Awaited<ReturnType<typeof fetchVideosGroupItems>>) {
  const src = readFileSync(KC_DATA_PATH, 'utf8')

  const lines: string[] = []
  lines.push('/* GENERATED:START — from Monday board "Revit" > "Videos" via scripts/digestRevitVideos.ts. Do not hand-edit; rerun the script instead. */')
  for (const item of items) {
    const comment = ` /* mondayItemId: ${item.mondayItemId} */`
    lines.push(
      `        {n:${jsStringLiteral(item.name)}, s:"done", video:${jsStringLiteral(item.driveId)}, descEn:${jsStringLiteral(item.descEn)}, descHe:${jsStringLiteral(item.descHe)}},${comment}`
    )
  }
  lines.push('        /* GENERATED:END */')
  const generatedBlock = lines.join('\n')

  const startMarker = '["Videos", ['
  const startIdx = src.indexOf(startMarker)
  if (startIdx === -1) throw new Error('Could not find ["Videos", [ in kc-data.js')
  const arrayContentStart = startIdx + startMarker.length
  const endMarker = '\n      ]],\n      ["MEP"'
  const endIdx = src.indexOf(endMarker, arrayContentStart)
  if (endIdx === -1) throw new Error('Could not find the end of the Videos array in kc-data.js')

  const next = src.slice(0, arrayContentStart) + '\n' + generatedBlock + src.slice(endIdx)
  writeFileSync(KC_DATA_PATH, next, 'utf8')
  console.log(`Regenerated kc-data.js: ${items.length} Videos entries.`)
}

async function main() {
  const items = await fetchVideosGroupItems()
  console.log(`Monday: ${items.length} items in "Videos" carry a Google Drive video file.`)
  for (const item of items) console.log(`  ${item.name}  (${item.driveId})`)
  regenerateKcData(items)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
