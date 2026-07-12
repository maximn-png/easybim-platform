import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let uri = env.split(/\r?\n/).find((l) => l.startsWith('MONGODB_URI=')).slice(12).trim()
if ((uri[0] === '"' && uri.endsWith('"'))) uri = uri.slice(1, -1)
await mongoose.connect(uri)
const runs = await mongoose.connection.db.collection('agentruns')
  .find({ agentKey: 'squirrel' }).sort({ startedAt: -1 }).limit(8).toArray()
for (const r of runs) console.log(r.startedAt?.toISOString?.() ?? r.startedAt, '|', r.pass, '|', r.status, '|', (r.summary ?? r.error ?? '').slice(0, 160))
await mongoose.disconnect()
