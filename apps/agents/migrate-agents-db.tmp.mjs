// Pre-deploy re-copy: mirror the Agent Kingdom collections from the OLD home
// (bim-newsletter, old default collection names) into easybim-agents under the
// new naming scheme. Idempotent — replaces the target wholesale. Run this right
// before switching the Vercel MONGODB_URI to /easybim-agents, so rows prod wrote
// to bim-newsletter in the meantime come along.
// Usage:  $env:MONGODB_URI="...cluster0.../bim-newsletter"; node .\migrate-agents-db.tmp.mjs
import mongoose from 'mongoose'

const URI = process.env.MONGODB_URI
if (!URI) throw new Error('MONGODB_URI missing')

// [source collection in bim-newsletter, target collection in easybim-agents]
const MAPPING = [
  ['agentruns', 'agent_runs'],
  ['agentmessages', 'agent_messages'],
  ['agentconversations', 'agent_conversations'],
  ['agentguidances', 'agent_guidance'],
  ['quoterecords', 'squirrel_quotes'],
  ['quotecontents', 'squirrel_quote_contents'],
]
const BATCH = 25

const conn = await mongoose.createConnection(URI).asPromise()
const src = conn.useDb('bim-newsletter')
const dst = conn.useDb('easybim-agents')

for (const [from, to] of MAPPING) {
  await dst.db.collection(to).deleteMany({})
  const cursor = src.db.collection(from).find({})
  let batch = []
  for await (const doc of cursor) {
    batch.push(doc)
    if (batch.length >= BATCH) {
      await dst.db.collection(to).insertMany(batch)
      batch = []
    }
  }
  if (batch.length) await dst.db.collection(to).insertMany(batch)
  const [a, b] = await Promise.all([
    src.db.collection(from).countDocuments(),
    dst.db.collection(to).countDocuments(),
  ])
  console.log(`${from} -> ${to}: source=${a} target=${b} ${a === b ? 'OK' : 'MISMATCH'}`)
}

await conn.close()
