/**
 * One-off, rerunnable: strip Unicode bidi control characters (LRM/RLM/LRE/
 * RLE/PDF/LRO/RLO/LRI/RLI/FSI/PDI, zero-width space/joiners, BOM) from
 * ALREADY-digested Document records. Google Docs (and, less often, Word)
 * embeds these around mixed-direction text runs — e.g. an English term
 * inline inside Hebrew — so the browser's bidi algorithm renders each run
 * in the right direction. They're meant to be invisible, but not every
 * font/renderer treats them that way; some show a visible "missing glyph"
 * box in their place instead (see digestProviders/googleDocs.ts's own
 * comment, where FUTURE digests are already fixed at the source). This
 * only cleans up what's already sitting in Mongo — no re-digest needed,
 * every affected field just needs the same characters stripped and
 * re-saved.
 *
 *   npx tsx --env-file=.env.local scripts/cleanBidiMarks.ts
 */
import dns from 'node:dns'
dns.setServers(['8.8.8.8'])

import { connectDB } from '../lib/db/mongoose'
import Document from '../lib/models/Document'

// Built from character codes rather than typed as literal \u escapes —
// this exact class of invisible character is the bug being cleaned up, so
// letting an editor or terminal silently render/re-encode them into this
// script's own source would be self-defeating.
const BS = String.fromCharCode(92)
function esc(hex: string) {
  return BS + 'u' + hex
}
const BIDI_MARKS = new RegExp(
  '[' + esc('200B') + '-' + esc('200F') + esc('202A') + '-' + esc('202E') + esc('2066') + '-' + esc('2069') + esc('FEFF') + ']',
  'g'
)
// Google Docs' own representation of a soft (Shift+Enter) line break
// WITHIN a paragraph — a literal vertical tab — renders as a visible
// "missing glyph" box rather than the whitespace it's meant to be.
const SOFT_BREAKS = new RegExp('[' + esc('000B') + esc('000C') + ']', 'g')

function cleanText<T extends string | undefined>(s: T): T {
  if (typeof s !== 'string') return s
  return s.replace(BIDI_MARKS, '').replace(SOFT_BREAKS, ' ') as T
}

async function main() {
  await connectDB()
  const docs = await Document.find({})
  console.log(`Checking ${docs.length} documents...`)

  let changedDocs = 0
  for (const doc of docs) {
    const before = JSON.stringify(doc.toObject())

    doc.title = cleanText(doc.title)
    doc.code = cleanText(doc.code)
    doc.series = cleanText(doc.series)

    doc.blocks.forEach((b) => {
      b.txt = cleanText(b.txt)
      b.num = cleanText(b.num)
      b.cap = cleanText(b.cap)
      if (b.items) b.items = b.items.map((it) => cleanText(it) ?? it)
    })
    doc.toc.forEach((t) => {
      t.txt = cleanText(t.txt) ?? t.txt
      t.num = cleanText(t.num)
    })
    doc.links.forEach((l) => {
      l.title = cleanText(l.title) ?? l.title
    })
    doc.versionHistory.forEach((v) => {
      v.v = cleanText(v.v) ?? v.v
      v.date = cleanText(v.date) ?? v.date
      v.who = cleanText(v.who) ?? v.who
    })

    const after = JSON.stringify(doc.toObject())
    if (before !== after) {
      doc.markModified('blocks')
      doc.markModified('toc')
      doc.markModified('links')
      doc.markModified('versionHistory')
      await doc.save()
      changedDocs++
      console.log(`  cleaned: ${doc.title}`)
    }
  }

  console.log(`\nDone: ${changedDocs} of ${docs.length} documents had bidi marks removed.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
