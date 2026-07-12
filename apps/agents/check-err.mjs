import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'
const env = readFileSync('C:/easybim-platform/apps/agents/.env.local', 'utf-8')
let uri = env.split(/\r?\n/).find((l) => l.startsWith('MONGODB_URI=')).slice(12).trim()
if ((uri[0] === '"' && uri.endsWith('"'))) uri = uri.slice(1, -1)
await mongoose.connect(uri)
const r = await mongoose.connection.db.collection('agentruns').findOne({ agentKey: 'squirrel', status: 'error' }, { sort: { startedAt: -1 } })
console.log('error detail:', r?.error)
await mongoose.disconnect()
