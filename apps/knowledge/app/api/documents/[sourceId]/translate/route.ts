import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Document from '@/lib/models/Document'
import { translateDocument } from '@/lib/kc/translate'

// GET /api/documents/:sourceId/translate — the real translation the
// Translation panel reads (replacing kc-app.js's hardcoded KC.TR_DOC example).
// Cached per document, invalidated by `version` (Integration Points.md §5).
// Returns the exact shape KC.trRender() already knows how to paint:
// { title:{he,ru,en}, series:{he,ru,en}, blocks:[{k,he,ru,en,...}] }.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sourceId } = await params
  await connectDB()
  const doc = await Document.findOne({ sourceDocId: sourceId })
  if (!doc || doc.status !== 'ready') {
    return NextResponse.json({ ok: false, message: 'Document not available' }, { status: 404 })
  }

  let translation = doc.translation
  if (!translation || translation.forVersion !== doc.version) {
    try {
      const result = await translateDocument({ title: doc.title, series: doc.series, blocks: doc.blocks })
      translation = {
        forVersion: doc.version,
        title: result.title,
        series: result.series,
        blocks: result.blocks,
        translatedAt: new Date(),
      }
      doc.translation = translation
      await doc.save()
    } catch (err) {
      // Provider unavailable / malformed response — fail without blocking
      // reading (UI States.md §6): the caller falls back to the last cached
      // version or an explicit "unavailable" state, never a silent overwrite.
      return NextResponse.json({ ok: false, message: (err as Error).message }, { status: 502 })
    }
  }

  // "HE" is just the original source text — merge it in from doc.blocks,
  // walking in the same order translateDocument used to build `translation.blocks`.
  let ti = 0
  const blocks: Array<Record<string, unknown>> = []
  for (const b of doc.blocks) {
    if (b.t === 'h') {
      const t = translation.blocks[ti++]
      blocks.push({ k: 'h', lvl: b.lvl, num: b.num, anchor: b.anchor, he: b.txt, ru: t?.ru || '', en: t?.en || '' })
    } else if (b.t === 'p') {
      const t = translation.blocks[ti++]
      blocks.push({ k: 'p', sub: b.sub, he: b.txt, ru: t?.ru || '', en: t?.en || '' })
    } else if (b.t === 'callout') {
      const t = translation.blocks[ti++]
      blocks.push({ k: 'p', he: b.txt, ru: t?.ru || '', en: t?.en || '' })
    } else if (b.t === 'ul' || b.t === 'ol') {
      const t = translation.blocks[ti++]
      const items = (b.items || []).map((txt, idx) => ({
        he: txt,
        ru: t?.items?.[idx]?.ru || '',
        en: t?.items?.[idx]?.en || '',
      }))
      blocks.push({ k: 'ul', items })
    }
    // 'fig' — no text, omitted (matches KC.trRender's own unsupported kinds).
  }

  return NextResponse.json({
    ok: true,
    title: { he: doc.title, ru: translation.title.ru, en: translation.title.en },
    series: { he: doc.series || '', ru: translation.series.ru, en: translation.series.en },
    blocks,
  })
}
