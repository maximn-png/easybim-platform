/**
 * One-off / rerunnable: build the Mentor's real search index (DocumentChunk)
 * for every currently `ready` Document. Run once after this feature ships;
 * every future digest import and every approved suggestion already calls
 * reindexDocument itself (see lib/kc/embeddings.ts), so this script only
 * needs re-running for documents that existed before that wiring landed.
 *
 *   npx tsx --env-file=.env.local scripts/embedAllDocuments.ts
 */
import dns from 'node:dns'

dns.setServers(['8.8.8.8'])

import { connectDB } from '../lib/db/mongoose'
import { reindexDocument } from '../lib/kc/embeddings'
import Document from '../lib/models/Document'

async function main() {
  await connectDB()
  const docs = await Document.find({ status: 'ready' }, { sourceDocId: 1, title: 1 }).lean()
  console.log(`Embedding ${docs.length} ready documents...`)

  let totalChunks = 0
  for (const doc of docs) {
    try {
      const count = await reindexDocument(doc.sourceDocId)
      totalChunks += count
      console.log(`  ${count.toString().padStart(3)} chunks   ${doc.title}`)
    } catch (err) {
      console.error(`  ERROR   ${doc.title}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`\nDone: ${totalChunks} chunks across ${docs.length} documents.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
