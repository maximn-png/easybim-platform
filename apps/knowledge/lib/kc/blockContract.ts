import type { ContractBlock, DigestIssue, TocEntry, VersionHistoryEntry } from '@/lib/models/Document'

// Shared Knowledge Center Block Contract v1 types/validation (see
// design_handoff_knowledge_center_backend/spec/Block Contract.md). Every
// digest provider under ./digestProviders/ (Google Docs, .docx, more later)
// depends on this file and nothing else in ./kc/ — kept dependency-free so
// digest.ts (which imports the providers) and the providers (which need this
// module) never form a cycle.

export const H_MIN = 2
export const H_MAX = 5
const MAX_LIST_ITEMS = 200
const MAX_TEXT = 20000
export const MAX_FIGURE_BYTES = 8 * 1024 * 1024 // guard against a degenerate/huge embedded asset

// Figures are NOT stored in MongoDB. Two reasons: (1) public/kc/kc-docpage.js
// — a do-not-edit file — hardcodes figSrc() to always resolve a `fig` block's
// id to the static path `assets/docpage/<id>.png`; it never fetches an image
// via any API, so a Mongo-backed image store would just be dead weight the
// current frontend can never read. (2) the shared Atlas cluster is a 512MB
// free tier used by every EasyBIM app — image bytes for ~40 documents alone
// ran well past that. Figures are downloaded by each provider and returned as
// plain buffers; the caller (the batch script / import route) writes them
// straight to public/kc/assets/docpage/ as real static files, exactly like
// the existing Project Startup demo images.
export interface DigestedFigure {
  id: string
  data: Buffer
  caption: string
}

export interface DigestSuccess {
  ok: true
  title: string
  blocks: ContractBlock[]
  toc: TocEntry[]
  versionHistory: VersionHistoryEntry[]
  digestIssues: DigestIssue[]
  figures: DigestedFigure[]
}

export interface DigestFailure {
  ok: false
  errorMessage: string
  sourceUrl?: string
}

export type DigestResult = DigestSuccess | DigestFailure

export const clean = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, MAX_TEXT)

/** Server-side twin of public/kc/kc-blocks.js's KC.Blocks.normalize — same
 * degradation rules, run over the assembled blocks before saving (README:
 * "mirror its rules server-side"). Shared by every digest provider. */
export function normalizeBlocks(raw: ContractBlock[]): { blocks: ContractBlock[]; issues: DigestIssue[] } {
  const issues: DigestIssue[] = []
  const note = (code: string, at: number, detail = '') => issues.push({ code, at, detail })
  const out: ContractBlock[] = []

  raw.forEach((b, i) => {
    if (!b || typeof b !== 'object') {
      note('bad-block', i, typeof b)
      return
    }
    const t = b.t

    if (t === 'h') {
      const txt = clean(b.txt)
      if (!txt) {
        note('empty', i, 'h')
        return
      }
      let lvl = b.lvl ?? H_MIN
      if (lvl < H_MIN || lvl > H_MAX) {
        note('level-clamped', i, `lvl=${b.lvl}`)
        lvl = Math.min(H_MAX, Math.max(H_MIN, lvl))
      }
      out.push({ t: 'h', lvl, txt, num: clean(b.num), anchor: b.anchor })
      return
    }
    if (t === 'p') {
      const txt = clean(b.txt)
      if (!txt) {
        note('empty', i, 'p')
        return
      }
      out.push({ t: 'p', txt, sub: !!b.sub, link: b.link })
      return
    }
    if (t === 'ul' || t === 'ol') {
      let items = Array.isArray(b.items) ? b.items.map(clean).filter(Boolean) : []
      if (!items.length) {
        note('empty', i, t)
        return
      }
      if (items.length > MAX_LIST_ITEMS) {
        note('list-truncated', i, `${items.length} -> ${MAX_LIST_ITEMS}`)
        items = items.slice(0, MAX_LIST_ITEMS)
      }
      out.push({ t, items, sub: !!b.sub, sq: !!b.sq })
      return
    }
    if (t === 'callout') {
      const txt = clean(b.txt)
      if (!txt) {
        note('empty', i, 'callout')
        return
      }
      out.push({ t: 'callout', txt })
      return
    }
    if (t === 'fig') {
      const id = clean(b.id)
      if (!id) {
        note('empty', i, 'fig without id')
        return
      }
      out.push({ t: 'fig', id, cap: clean(b.cap) })
      return
    }
    note('unknown-type', i, t || '(no type)')
  })

  return { blocks: out, issues }
}
