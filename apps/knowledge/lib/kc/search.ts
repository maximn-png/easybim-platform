import { geminiEmbed } from '@/lib/integrations/gemini'
import { connectDB } from '@/lib/db/mongoose'
import DocumentChunk from '@/lib/models/DocumentChunk'

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface SearchResult {
  sourceId: string
  title: string
  anchor?: string
  text: string
  score: number
}

// Plain in-memory cosine-similarity scan — no Atlas Vector Search index
// needed at this corpus size (~9,000 chunks, see the plan this shipped
// against). preferSourceId gives Topic-mode a small nudge toward whichever
// document is currently open, without hard-filtering everything else out.
export async function searchChunks(
  query: string,
  opts?: { limit?: number; preferSourceId?: string }
): Promise<SearchResult[]> {
  const limit = opts?.limit ?? 6
  await connectDB()

  const [queryVec] = await geminiEmbed([query])
  if (!queryVec) return []

  const all = await DocumentChunk.find({}, { sourceDocId: 1, embedding: 1 }).lean()
  const scored = all.map((c) => {
    let score = cosineSimilarity(queryVec, c.embedding)
    if (opts?.preferSourceId && c.sourceDocId === opts.preferSourceId) score += 0.05
    return { id: String(c._id), score }
  })
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)
  if (!top.length) return []

  const winners = await DocumentChunk.find(
    { _id: { $in: top.map((t) => t.id) } },
    { sourceDocId: 1, title: 1, anchor: 1, text: 1 }
  ).lean()
  const byId = new Map(winners.map((w) => [String(w._id), w]))

  const results: SearchResult[] = []
  for (const t of top) {
    const w = byId.get(t.id)
    if (!w) continue
    results.push({ sourceId: w.sourceDocId, title: w.title, anchor: w.anchor, text: w.text, score: t.score })
  }
  return results
}
