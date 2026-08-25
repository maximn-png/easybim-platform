import mammoth from 'mammoth'
import * as cheerio from 'cheerio'
import type { Types } from 'mongoose'
import type { ContractBlock, VersionHistoryEntry } from '@/lib/models/Document'
import type { DigestResult, DigestedFigure } from '../blockContract'
import { normalizeBlocks, H_MIN, H_MAX, MAX_FIGURE_BYTES } from '../blockContract'

// Same real-world template convention the Google Docs provider detects
// (design_handoff_knowledge_center_backend/spec — see ./googleDocs.ts): an
// unnumbered leading heading ("Versions" / "גרסאות") immediately followed by
// a table. Structural, not text-matched, so it works regardless of language.
const FRONT_MATTER_SCAN_LIMIT = 10

// Same bidi-control-character artifact as ./googleDocs.ts (see its own
// comment) — Word documents with mixed Hebrew/English content can embed
// the same invisible-in-theory marks, which some fonts render as a
// visible box. Stripped once here, applied at every text-extraction call
// site below via cleanText().
const BIDI_MARKS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g
// mammoth/Word can carry the same soft-line-break vertical tab Google Docs
// does (see ./googleDocs.ts) — same fix, replaced with a real space.
const SOFT_BREAKS = /[\u000B\u000C]/g
function cleanText(s: string): string {
  return s.replace(BIDI_MARKS, '').replace(SOFT_BREAKS, ' ').trim()
}

// Uploaded-.docx -> Knowledge Center Block Contract v1 converter. A second
// digest provider alongside ./googleDocs.ts (dispatched to by
// digestBySourceId() in ../digest based on the file's real Drive mimeType) —
// same output shape, same normalizeBlocks validation, different input parser
// (mammoth.js instead of the Docs API's structural JSON) because these files
// are uploaded Office documents living in Drive, not native Google Docs the
// Docs API can read.
//
// mammoth maps Word's "Heading 1..6" styles straight to <h1>..<h6>, and
// bullet/numbered lists to <ul>/<ol><li>. Images are intercepted via a custom
// convertImage handler so we get raw buffers (for the static-file figure
// pipeline — see ../digest's own note on why figures never go to Mongo)
// instead of mammoth's default inline base64 <img> tags.

export async function digestDocxBuffer(
  buffer: Buffer,
  documentId: Types.ObjectId,
  fallbackTitle: string
): Promise<DigestResult> {
  const collected: { contentType: string; buffer: Buffer }[] = []
  const convertImage = mammoth.images.imgElement(async (image) => {
    const data = await image.readAsBuffer()
    const idx = collected.length
    collected.push({ contentType: image.contentType, buffer: data })
    return { src: `fig-placeholder-${idx}` }
  })

  let html: string
  try {
    const result = await mammoth.convertToHtml({ buffer }, { convertImage })
    html = result.value
  } catch (err) {
    return { ok: false, errorMessage: `.docx conversion failed: ${(err as Error).message}` }
  }

  const $ = cheerio.load(html)
  const children = $('body').children().toArray()
  const cellsOf = (table: (typeof children)[number]): string[][] =>
    $(table)
      .find('> tbody > tr, > tr')
      .toArray()
      .map((tr) =>
        $(tr)
          .find('> td, > th')
          .toArray()
          .map((cell) => cleanText($(cell).text()))
      )

  // Detect the leading "Versions" front matter: first heading in the first
  // few top-level elements, immediately followed (skipping blank paragraphs)
  // by a table — mirrors ./googleDocs.ts's extractVersionsFrontMatter.
  let versionHistory: VersionHistoryEntry[] = []
  let startIndex = 0
  {
    let headingIdx = -1
    for (let k = 0; k < Math.min(children.length, FRONT_MATTER_SCAN_LIMIT); k++) {
      if (/^h[1-6]$/.test($(children[k]).prop('tagName')?.toLowerCase() ?? '')) { headingIdx = k; break }
    }
    if (headingIdx !== -1) {
      let j = headingIdx + 1
      while (j < children.length && $(children[j]).prop('tagName')?.toLowerCase() === 'p' && !cleanText($(children[j]).text())) j++
      if ($(children[j])?.prop('tagName')?.toLowerCase() === 'table') {
        const rows = cellsOf(children[j])
        for (const cells of rows.slice(1)) {
          if (cells.length !== 3 || cells.every((c) => !c)) continue
          versionHistory.push({ v: cells[0], date: cells[1], who: cells[2] })
        }
        if (versionHistory.length) startIndex = j + 1
        else versionHistory = []
      }
    }
  }

  const blocks: ContractBlock[] = []
  const figures: DigestedFigure[] = []
  const headingCounters = [0, 0, 0, 0] // levels 2..5, same scheme as the Google Docs provider
  let headingSeq = 0
  let figureSeq = 0

  for (let i = startIndex; i < children.length; i++) {
    const $el = $(children[i])
    const tag = $el.prop('tagName')?.toLowerCase()

    const headingMatch = /^h([1-6])$/.exec(tag ?? '')
    if (headingMatch) {
      const txt = cleanText($el.text())
      if (!txt) continue
      const lvl = Math.min(H_MAX, Number(headingMatch[1]) + 1)
      const idx = lvl - H_MIN
      headingCounters[idx]++
      for (let k = idx + 1; k < headingCounters.length; k++) headingCounters[k] = 0
      const num = headingCounters.slice(0, idx + 1).join('.')
      headingSeq++
      blocks.push({ t: 'h', lvl, txt, num, anchor: `sec-${headingSeq}` })
      continue
    }

    if (tag === 'p') {
      const img = $el.find('img[src^="fig-placeholder-"]').first()
      if (img.length) {
        const m = /fig-placeholder-(\d+)/.exec(img.attr('src') ?? '')
        const image = m ? collected[Number(m[1])] : null
        if (image && image.buffer.byteLength <= MAX_FIGURE_BYTES) {
          figureSeq++
          const id = `${documentId}-${figureSeq}`
          const caption = cleanText($el.text())
          figures.push({ id, data: image.buffer, caption })
          blocks.push({ t: 'fig', id, cap: caption })
        }
        continue
      }
      const txt = cleanText($el.text())
      if (!txt) continue
      blocks.push({ t: 'p', txt })
      continue
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = $el
        .find('> li')
        .map((__, li) => cleanText($(li).text()))
        .get()
        .filter(Boolean)
      if (items.length) blocks.push({ t: tag, items })
      continue
    }

    if (tag === 'table') {
      // Any table other than the leading versions block: reduce to a
      // paragraph per cell rather than dropping the content silently —
      // same degradation as the Google Docs provider.
      for (const cells of cellsOf(children[i])) {
        for (const txt of cells) {
          if (txt) blocks.push({ t: 'p', txt })
        }
      }
    }
    // other tags (blockquote, hr, etc.) — not in the contract, skipped.
  }

  const { blocks: validated, issues: digestIssues } = normalizeBlocks(blocks)
  const toc = validated
    .filter((b) => b.t === 'h' && b.anchor)
    .map((b) => ({ txt: b.txt ?? '', anchor: b.anchor as string, lvl: b.lvl, num: b.num }))
  const keptFigureIds = new Set(validated.filter((b) => b.t === 'fig').map((b) => b.id))

  return {
    ok: true,
    title: fallbackTitle,
    blocks: validated,
    toc,
    versionHistory,
    digestIssues,
    figures: figures.filter((f) => keptFigureIds.has(f.id)),
  }
}
