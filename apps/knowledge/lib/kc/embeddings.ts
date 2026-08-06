import { geminiEmbed } from '@/lib/integrations/gemini'
import { connectDB } from '@/lib/db/mongoose'
import DocumentModel, { type ContractBlock } from '@/lib/models/Document'
import DocumentChunk from '@/lib/models/DocumentChunk'

const MAX_CHUNK_CHARS = 1000
const EMBED_BATCH_SIZE = 32

interface RawChunk {
  text: string
  anchor?: string
}

function blockText(b: ContractBlock): string {
  if (b.t === 'h' || b.t === 'p' || b.t === 'callout') return b.txt || ''
  if (b.t === 'ul' || b.t === 'ol') return (b.items || []).join('. ')
  return '' // 'fig' — no text to embed
}

// Groups consecutive paragraphs/list items under their nearest heading into
// ~1000-char chunks (a fresh chunk on hitting a heading, or on hitting the
// size cap) — keeps section context in each chunk without going one-chunk-
// per-block, which would be too many tiny, context-free fragments to
// retrieve well against.
export function chunkDocument(doc: { title: string; blocks: ContractBlock[] }): RawChunk[] {
  const chunks: RawChunk[] = []
  let current = ''
  let currentAnchor: string | undefined

  const flush = () => {
    const text = current.trim()
    if (text) chunks.push({ text: doc.title + '\n' + text, anchor: currentAnchor })
    current = ''
  }

  for (const b of doc.blocks) {
    if (b.t === 'fig') continue
    if (b.t === 'h') {
      flush()
      currentAnchor = b.anchor
      current = (b.txt || '') + '\n'
      continue
    }
    const t = blockText(b)
    if (!t) continue
    if (current.trim() && current.length + t.length > MAX_CHUNK_CHARS) flush()
    current += t + '\n'
  }
  flush()
  return chunks
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    const embedded = await geminiEmbed(batch)
    vectors.push(...embedded)
  }
  return vectors
}

// The one shared reindex path — called after a document is created or its
// blocks change (digest import, and the Suggestion resolve route's
// approved edits/additions/new-topic publishes), so the Mentor's search
// index never drifts behind real content changes.
export async function reindexDocument(sourceDocId: string): Promise<number> {
  await connectDB()
  const doc = await DocumentModel.findOne({ sourceDocId }).lean()
  await DocumentChunk.deleteMany({ sourceDocId })
  if (!doc || doc.status !== 'ready') return 0

  const raw = chunkDocument(doc)
  if (!raw.length) return 0

  const vectors = await embedTexts(raw.map((c) => c.text))
  await DocumentChunk.insertMany(
    raw.map((c, i) => ({
      sourceDocId,
      workspaceId: doc.workspaceId,
      title: doc.title,
      chunkIndex: i,
      text: c.text,
      anchor: c.anchor,
      embedding: vectors[i] || [],
    }))
  )
  return raw.length
}
