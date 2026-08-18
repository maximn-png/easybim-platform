import type { docs_v1 } from 'googleapis'
import type { Types } from 'mongoose'
import { getDocs } from '@/lib/integrations/googleDocs'
import type { ContractBlock, TocEntry, DigestIssue, VersionHistoryEntry } from '@/lib/models/Document'
import type { DigestResult, DigestedFigure } from '../blockContract'
import { normalizeBlocks, H_MIN, H_MAX, MAX_FIGURE_BYTES } from '../blockContract'

// Google Doc -> Knowledge Center Block Contract v1 converter (see
// design_handoff_knowledge_center_backend/spec/Block Contract.md and
// Integration Points.md section 2 for the mapping this implements). One of
// several digest providers dispatched to by digestBySourceId() in ../digest —
// this one only handles native Google Docs (mimeType
// application/vnd.google-apps.document); see ./docx.ts for uploaded Word files.

type StructuralElement = docs_v1.Schema$StructuralElement

// Google Docs embeds Unicode bidi control characters (LRM/RLM/LRE/RLE/PDF/
// LRI/RLI/FSI/PDI, zero-width space/joiners, BOM) around mixed-direction
// runs — e.g. an English term or number inline inside Hebrew text — so the
// browser's bidi algorithm renders each run in the right direction. They're
// meant to be invisible, but not every font/renderer treats them that way;
// some show a visible "missing glyph" box in their place instead. Safe to
// strip outright — they carry no information once this text leaves Google's
// own editor (this app decides each document/line's direction itself, via
// DP.docDir, not by leaving these in the text for the browser to infer from).
// Written as explicit \u escapes, not literal characters, on purpose — this
// exact class of invisible character is the bug being fixed, so typing them
// literally into this file would be self-defeating.
const BIDI_MARKS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g
// Google Docs also represents a soft (Shift+Enter) line break WITHIN a
// single paragraph as a literal vertical tab (\u000B) in
// textRun.content, rather than a real paragraph break — this text model
// has no concept of a mid-paragraph line break, and a stray control
// character renders as a visible "missing glyph" box, not whitespace.
// Replaced with a real space so the two halves stay readable as
// continuous text instead of running together with no separator at all.
const SOFT_BREAKS = /[\u000B\u000C]/g

function rawParagraphText(p: docs_v1.Schema$Paragraph | undefined | null): string {
  if (!p?.elements) return ''
  return p.elements.map((e) => e.textRun?.content ?? '').join('').replace(BIDI_MARKS, '')
}
function paragraphText(p: docs_v1.Schema$Paragraph | undefined | null): string {
  return rawParagraphText(p).replace(SOFT_BREAKS, ' ')
}

function isEmptyParagraph(el: StructuralElement): boolean {
  return !!el.paragraph && paragraphText(el.paragraph).trim() === ''
}

function cellText(cell: docs_v1.Schema$TableCell): string {
  return (cell.content ?? [])
    .map((c) => paragraphText(c.paragraph))
    .join('')
    .trim()
}

/** Detect the leading "Versions" front-matter block: the first HEADING_1 or
 * HEADING_2 found in the first few elements (skipping section breaks, the
 * document's own TITLE paragraph, and any other front matter ahead of it —
 * templates vary: some use H1 for "Versions", some H2), immediately followed
 * by a 3-column table. Structural, not text-matched, so it works regardless
 * of the document's language. Returns the parsed rows and the index to
 * resume the main body walk from, or null if the pattern isn't present.
 * Capped to a small prefix window so an unrelated heading+table pair deep in
 * the document is never mistaken for front matter. */
const FRONT_MATTER_SCAN_LIMIT = 10

function extractVersionsFrontMatter(
  content: StructuralElement[]
): { versionHistory: VersionHistoryEntry[]; skipThrough: number } | null {
  let i = -1
  for (let k = 0; k < Math.min(content.length, FRONT_MATTER_SCAN_LIMIT); k++) {
    const style = content[k].paragraph?.paragraphStyle?.namedStyleType
    if (style === 'HEADING_1' || style === 'HEADING_2') { i = k; break }
  }
  if (i === -1) return null
  let j = i + 1
  while (j < content.length && isEmptyParagraph(content[j])) j++
  const tableEl = content[j]
  if (!tableEl?.table || (tableEl.table.columns ?? 0) !== 3) return null

  const rows = tableEl.table.tableRows ?? []
  const versionHistory: VersionHistoryEntry[] = []
  // first row is the header (column labels) — skip it
  for (const row of rows.slice(1)) {
    const cells = (row.tableCells ?? []).map(cellText)
    if (cells.length !== 3 || cells.every((c) => !c)) continue
    versionHistory.push({ v: cells[0], date: cells[1], who: cells[2] })
  }
  return { versionHistory, skipThrough: j }
}

/** Google's HEADING_1..HEADING_5 map to our lvl 2..5 (lvl 1 is reserved for
 * the document title, per Block Contract.md). */
function headingLevel(namedStyleType: string | null | undefined): number | null {
  const m = /^HEADING_(\d)$/.exec(namedStyleType ?? '')
  if (!m) return null
  return Number(m[1]) + 1
}

const isIndented = (style: docs_v1.Schema$ParagraphStyle | undefined | null): boolean => {
  const start = style?.indentStart?.magnitude ?? 0
  const first = style?.indentFirstLine?.magnitude ?? 0
  return Math.max(start, first) >= 36 // ~0.5" — a real indent, not rounding noise
}

function isFullyBold(p: docs_v1.Schema$Paragraph): boolean {
  const runs = (p.elements ?? []).filter((e) => e.textRun?.content?.trim())
  return runs.length > 0 && runs.every((e) => e.textRun?.textStyle?.bold)
}

/** Some of these real documents use a fully-bold (sometimes also
 * underlined), non-heading-styled paragraph as a visual section header —
 * confirmed against real documents, not assumed. Two distinct shapes, both
 * requiring every text run in the paragraph to be bold (never just a bold
 * word inside an otherwise plain sentence):
 *
 * 1. It shares a `bullet.listId` with an actual numbered heading elsewhere
 *    in the document — i.e. it's a sibling entry in the very same
 *    author-numbered heading list, just not itself given a formal Heading
 *    style (e.g. "Acquire Coordinates & Revit Link" sitting among
 *    HEADING_2 siblings under the same list as "מידע ראשוני נדרש"). Its
 *    number/level are derived exactly like a real numbered heading's, via
 *    that same list's nesting.
 * 2. No bullet at all, just fully bold and indented — nesting depth read
 *    from indentStart/indentFirstLine, in the same ~36pt (0.5") increments
 *    isIndented() already treats as "a real indent".
 *
 * Either way this exists so these get a real anchor/TOC entry instead of
 * disappearing into a plain paragraph, matching what the author actually
 * structured rather than only what carries an official "Heading N" style. */
function boldPseudoHeadingLevel(p: docs_v1.Schema$Paragraph): number | null {
  if (!isFullyBold(p)) return null
  if (p.bullet) return H_MIN + 1 // same base level real numbered headings in these docs use (HEADING_2) — nesting offset applied by the caller
  const indent = Math.max(p.paragraphStyle?.indentStart?.magnitude ?? 0, p.paragraphStyle?.indentFirstLine?.magnitude ?? 0)
  if (indent < 36) return null
  const depth = Math.max(1, Math.round(indent / 36))
  return Math.min(H_MAX, H_MIN + depth)
}

interface FigureCandidate {
  contentUri?: string | null
  width?: number
  height?: number
}

function objectFromInline(doc: docs_v1.Schema$Document, objectId: string): FigureCandidate | null {
  const obj = doc.inlineObjects?.[objectId]?.inlineObjectProperties?.embeddedObject
  if (!obj?.imageProperties?.contentUri) return null
  return {
    contentUri: obj.imageProperties.contentUri,
    width: obj.size?.width?.magnitude ?? undefined,
    height: obj.size?.height?.magnitude ?? undefined,
  }
}

function objectFromPositioned(doc: docs_v1.Schema$Document, objectId: string): FigureCandidate | null {
  const obj = doc.positionedObjects?.[objectId]?.positionedObjectProperties?.embeddedObject
  if (!obj?.imageProperties?.contentUri) return null
  return {
    contentUri: obj.imageProperties.contentUri,
    width: obj.size?.width?.magnitude ?? undefined,
    height: obj.size?.height?.magnitude ?? undefined,
  }
}

async function downloadFigure(candidate: FigureCandidate, id: string, caption: string): Promise<DigestedFigure | null> {
  if (!candidate.contentUri) return null
  try {
    const res = await fetch(candidate.contentUri)
    if (!res.ok) return null
    const data = Buffer.from(await res.arrayBuffer())
    if (data.byteLength > MAX_FIGURE_BYTES) return null
    return { id, data, caption }
  } catch {
    return null
  }
}

export async function digestGoogleDoc(
  sourceDocId: string,
  documentId: Types.ObjectId
): Promise<DigestResult> {
  let doc: docs_v1.Schema$Document
  try {
    const res = await getDocs().documents.get({ documentId: sourceDocId })
    doc = res.data
  } catch (err) {
    return { ok: false, errorMessage: (err as Error).message }
  }

  const content = doc.body?.content ?? []
  const digestIssues: DigestIssue[] = []
  let versionHistory: VersionHistoryEntry[] = []
  let startIndex = 0

  const versions = extractVersionsFrontMatter(content)
  if (versions) {
    versionHistory = versions.versionHistory
    startIndex = versions.skipThrough + 1
  }

  const blocks: ContractBlock[] = []
  const figures: DigestedFigure[] = []
  let figureSeq = 0
  // A heading's number is never synthesized from its nesting level — most
  // headings in these real documents (e.g. "הקדמה"/Introduction, "אופן
  // פעולה"/Procedure) carry no number in the source document at all, and
  // inventing a sequential one for them doesn't match the original. The only
  // headings that DO have a real number are the ones Google Docs represents
  // as a numbered-list item that happens to use a heading style (p.bullet is
  // set) — same mechanism as an ordinary numbered list elsewhere in the body,
  // just applied to a heading paragraph. Each list gets its own independent
  // per-nesting-level counter, exactly like the ul/ol handling below.
  const headingListCounters = new Map<string, number[]>()
  let headingSeq = 0
  let pendingListId: string | null = null
  let pendingListType: 'ul' | 'ol' | null = null
  let pendingListItems: string[] = []

  const flushList = () => {
    if (pendingListType && pendingListItems.length) {
      blocks.push({ t: pendingListType, items: pendingListItems })
    }
    pendingListId = null
    pendingListType = null
    pendingListItems = []
  }

  for (let i = startIndex; i < content.length; i++) {
    const el = content[i]

    if (el.table) {
      flushList()
      // any table other than the leading versions block: reduce to
      // paragraphs-per-cell and log it, matching the documented degradation
      // for structures outside the contract.
      for (const row of el.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          const txt = cellText(cell)
          if (txt) blocks.push({ t: 'p', txt })
        }
      }
      digestIssues.push({ code: 'unknown-type', at: blocks.length, detail: 'table reduced to paragraphs' })
      continue
    }

    const p = el.paragraph
    if (!p) continue

    const baseLvl = headingLevel(p.paragraphStyle?.namedStyleType) ?? boldPseudoHeadingLevel(p)
    if (baseLvl != null) {
      flushList()
      // The author sometimes kept typing body text into a heading-styled
      // paragraph via a soft (Shift+Enter) break instead of starting a new
      // paragraph — Google Docs' own per-paragraph styling doesn't
      // distinguish the two, so the WHOLE thing (heading label + however
      // many sentences follow) comes through as one heading. Only the part
      // before the first soft break is really the heading; anything after
      // becomes its own normal paragraph, same as if the author had
      // pressed Enter instead of Shift+Enter.
      const rawTxt = rawParagraphText(p).trim()
      if (!rawTxt) continue
      const breakAt = rawTxt.search(SOFT_BREAKS)
      const txt = breakAt === -1 ? rawTxt : rawTxt.slice(0, breakAt).trim()
      const restTxt = breakAt === -1 ? '' : rawTxt.slice(breakAt + 1).replace(SOFT_BREAKS, ' ').trim()
      if (!txt) continue
      headingSeq++
      let num = ''
      let lvl = baseLvl
      const listId = p.bullet?.listId
      if (listId) {
        const nesting = p.bullet?.nestingLevel ?? 0
        let counters = headingListCounters.get(listId)
        if (!counters) {
          counters = [0, 0, 0, 0, 0, 0]
          // Google Docs sometimes gives a nested sub-list its own listId
          // instead of continuing the parent list's — numbering would
          // otherwise restart at "0.1" under "1" instead of continuing as
          // "1.1", contradicting the visual nesting entirely. Only kicks in
          // the first time THIS listId is seen, and only when it starts
          // already nested (nesting > 0) right after a shallower real
          // number to inherit from — never touches an ordinary top-level
          // list's own counting.
          if (nesting > 0) {
            const prevHeading = blocks.filter((b) => b.t === 'h').pop()
            if (prevHeading?.num) {
              const parts = prevHeading.num.split('.')
              for (let k = 0; k < Math.min(nesting, parts.length); k++) counters[k] = parseInt(parts[k], 10) || 0
            }
          }
          headingListCounters.set(listId, counters)
        }
        counters[nesting] = (counters[nesting] ?? 0) + 1
        for (let k = nesting + 1; k < counters.length; k++) counters[k] = 0
        num = counters.slice(0, nesting + 1).join('.')
        // The Word/Docs heading STYLE (Heading 2, Heading 3, ...) doesn't
        // always change between a numbered item and its own sub-items —
        // Google Docs can keep every one of them at the same heading style
        // and vary only the list's nesting level to show hierarchy (that's
        // exactly what's happening here: "1", "1.1", "1.2"... are all
        // HEADING_2). Fold that nesting into the visual level too, so "1.1"
        // actually indents under "1" in the TOC instead of sitting flush
        // with it — otherwise the numbers imply nesting the layout doesn't.
        lvl = Math.min(H_MAX, baseLvl + nesting)
      }
      blocks.push({ t: 'h', lvl, txt, num, anchor: `sec-${headingSeq}` })
      if (restTxt) blocks.push({ t: 'p', txt: restTxt })
      continue
    }

    // figures: positioned objects (the dominant mechanism in these real docs)
    // and inline objects (rare, but checked too).
    const positionedIds = p.positionedObjectIds ?? []
    const inlineIds = (p.elements ?? [])
      .map((e) => e.inlineObjectElement?.inlineObjectId)
      .filter((x): x is string => !!x)

    if (positionedIds.length || inlineIds.length) {
      flushList()
      const caption = paragraphText(p).trim()
      for (const objId of positionedIds) {
        const cand = objectFromPositioned(doc, objId)
        if (!cand) continue
        figureSeq++
        const fig = await downloadFigure(cand, `${documentId}-${figureSeq}`, caption)
        if (fig) {
          figures.push(fig)
          blocks.push({ t: 'fig', id: fig.id, cap: caption })
        }
      }
      for (const objId of inlineIds) {
        const cand = objectFromInline(doc, objId)
        if (!cand) continue
        figureSeq++
        const fig = await downloadFigure(cand, `${documentId}-${figureSeq}`, caption)
        if (fig) {
          figures.push(fig)
          blocks.push({ t: 'fig', id: fig.id, cap: caption })
        }
      }
      continue
    }

    // lists
    if (p.bullet) {
      const listId = p.bullet.listId ?? null
      const nesting = p.bullet.nestingLevel ?? 0
      const glyph = doc.lists?.[listId ?? '']?.listProperties?.nestingLevels?.[nesting]?.glyphType ?? ''
      const isOrdered = /DECIMAL|ALPHA|ROMAN/i.test(glyph)
      const type: 'ul' | 'ol' = isOrdered ? 'ol' : 'ul'
      const txt = paragraphText(p).trim()
      if (!txt) continue
      if (pendingListId !== listId || pendingListType !== type) {
        flushList()
        pendingListId = listId
        pendingListType = type
      }
      pendingListItems.push(txt)
      continue
    }
    flushList()

    // ordinary paragraph
    const txt = paragraphText(p).trim()
    if (!txt) continue
    blocks.push({ t: 'p', txt, sub: isIndented(p.paragraphStyle) })
  }
  flushList()

  const { blocks: validated, issues: validationIssues } = normalizeBlocks(blocks)
  const toc: TocEntry[] = validated
    .filter((b) => b.t === 'h' && b.anchor)
    .map((b) => ({ txt: b.txt ?? '', anchor: b.anchor as string, lvl: b.lvl, num: b.num }))

  const keptFigureIds = new Set(validated.filter((b) => b.t === 'fig').map((b) => b.id))

  return {
    ok: true,
    title: doc.title ?? sourceDocId,
    blocks: validated,
    toc,
    versionHistory,
    digestIssues: [...digestIssues, ...validationIssues],
    figures: figures.filter((f) => keptFigureIds.has(f.id)),
  }
}
