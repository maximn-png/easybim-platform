import { geminiChat } from '@/lib/integrations/gemini'
import type { ContractBlock, TranslatedBlock } from '@/lib/models/Document'

// Real document translation (RU/EN) — replaces the Translation panel's
// hardcoded single example (public/kc/kc-app.js's KC.TR_DOC, "test translation
// of the open document (Project Startup)"). Hebrew needs no AI call: every
// digested document's source language already IS Hebrew, so the panel's "HE"
// option is just the original text passed through unchanged — only RU and EN
// are real translations, produced together in one pass per document.
//
// kc-app.js's KC.trRender() only knows how to paint k:'h'|'p'|'ul' (see that
// file) — 'ol' blocks are mapped down to 'ul' here, 'callout' to 'p', and
// 'fig' blocks (no translatable text) are dropped entirely. Can't change
// trRender itself, so the translated shape is built to fit what it already
// renders, exactly like the digest converter fits kc-docpage.js's contract.

const BATCH_SIZE = 30

interface Slot {
  kind: 'title' | 'series' | 'h' | 'p' | 'ul'
  fragIndices: number[]
  lvl?: number
  num?: string
  anchor?: string
  sub?: boolean
}

function buildTranslationPlan(doc: { title: string; series?: string; blocks: ContractBlock[] }) {
  const fragments: string[] = []
  const slots: Slot[] = []
  const push = (s: string) => { fragments.push(s || ''); return fragments.length - 1 }

  slots.push({ kind: 'title', fragIndices: [push(doc.title)] })
  slots.push({ kind: 'series', fragIndices: [push(doc.series || '')] })

  for (const b of doc.blocks) {
    if (b.t === 'h') slots.push({ kind: 'h', fragIndices: [push(b.txt || '')], lvl: b.lvl, num: b.num, anchor: b.anchor })
    else if (b.t === 'p') slots.push({ kind: 'p', fragIndices: [push(b.txt || '')], sub: b.sub })
    else if (b.t === 'callout') slots.push({ kind: 'p', fragIndices: [push(b.txt || '')] })
    else if (b.t === 'ul' || b.t === 'ol') slots.push({ kind: 'ul', fragIndices: (b.items || []).map(push) })
    // 'fig' — no text, skipped.
  }
  return { fragments, slots }
}

function parseJsonArray<T>(text: string): T[] | null {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const v = JSON.parse(cleaned)
    return Array.isArray(v) ? (v as T[]) : null
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      try { const v = JSON.parse(match[0]); return Array.isArray(v) ? (v as T[]) : null } catch { return null }
    }
    return null
  }
}

async function translateBatch(texts: string[]): Promise<{ ru: string; en: string }[]> {
  if (!texts.length) return []
  const prompt = `You are translating internal BIM/Revit/construction technical documentation for EasyBIM, a BIM engineering practice. Translate EACH of the following Hebrew text fragments into natural, technically accurate Russian and English, as a BIM professional would write it. Keep software/product names and BIM-specific technical terms (e.g. "Revit", "ACC", "BIM360", "Copy Monitor", "Worksets", "Acquire Coordinates") as commonly used by BIM professionals rather than translating them literally when that would be unnatural. Empty fragments translate to empty strings.

Return ONLY a JSON array, no markdown, no commentary — exactly ${texts.length} objects, one per fragment, IN THE SAME ORDER, shaped exactly as:
[{"ru":"...","en":"..."}, ...]

Fragments (a JSON array of ${texts.length} strings):
${JSON.stringify(texts)}`

  const raw = await geminiChat(prompt)
  const parsed = parseJsonArray<{ ru: string; en: string }>(raw)
  if (!parsed || parsed.length !== texts.length) {
    throw new Error(`Gemini translation batch mismatch: expected ${texts.length}, got ${parsed ? parsed.length : 'unparsable response'}`)
  }
  return parsed.map((p) => ({ ru: p.ru || '', en: p.en || '' }))
}

export interface TranslatedDocument {
  title: { ru: string; en: string }
  series: { ru: string; en: string }
  blocks: TranslatedBlock[]
}

export async function translateDocument(doc: {
  title: string
  series?: string
  blocks: ContractBlock[]
}): Promise<TranslatedDocument> {
  const { fragments, slots } = buildTranslationPlan(doc)
  const results: { ru: string; en: string }[] = new Array(fragments.length)

  // Batches are independent chunks of the same document — run them
  // concurrently instead of awaiting one at a time. A ~200-block document
  // needs 7-8 batches; sequentially that's 7-8x a single batch's latency,
  // concurrently it's about one batch's latency total.
  const starts: number[] = []
  for (let i = 0; i < fragments.length; i += BATCH_SIZE) starts.push(i)
  await Promise.all(
    starts.map(async (i) => {
      const batch = fragments.slice(i, i + BATCH_SIZE)
      const translated = await translateBatch(batch)
      translated.forEach((t, j) => { results[i + j] = t })
    })
  )

  let title = { ru: '', en: '' }
  let series = { ru: '', en: '' }
  const blocks: TranslatedBlock[] = []

  for (const slot of slots) {
    if (slot.kind === 'title') { title = results[slot.fragIndices[0]]; continue }
    if (slot.kind === 'series') { series = results[slot.fragIndices[0]]; continue }
    if (slot.kind === 'ul') {
      blocks.push({ k: 'ul', items: slot.fragIndices.map((fi) => results[fi]) })
      continue
    }
    const r = results[slot.fragIndices[0]]
    blocks.push({ k: slot.kind, lvl: slot.lvl, num: slot.num, anchor: slot.anchor, sub: slot.sub, ru: r.ru, en: r.en })
  }

  return { title, series, blocks }
}
