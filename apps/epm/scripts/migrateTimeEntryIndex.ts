// One-off: TimeEntry uniqueness moved from (user, project, day) to
// (user, project, day, subject, subtopic) when the week grid gained the
// Subject/Subtopic taxonomy. Drops the old unique index, stamps legacy rows
// with empty categories, and syncs the new indexes.
//
//   cd apps/epm && npx tsx --env-file=.env.local scripts/migrateTimeEntryIndex.ts
//
// Run once per database (dev + prod).
import mongoose from 'mongoose'
import TimeEntry from '../app/models/TimeEntry'

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  await mongoose.connect(uri)
  const col = mongoose.connection.collection('timeentries')

  try {
    await col.dropIndex('userId_1_projectKey_1_date_1')
    console.log('dropped old unique index userId_1_projectKey_1_date_1')
  } catch (e) {
    console.log('old index not dropped (probably already gone):', (e as Error).message)
  }

  const res = await col.updateMany(
    { $or: [{ subject: { $exists: false } }, { subtopic: { $exists: false } }] },
    [{ $set: { subject: { $ifNull: ['$subject', ''] }, subtopic: { $ifNull: ['$subtopic', ''] } } }]
  )
  console.log('stamped legacy rows:', res.modifiedCount)

  await TimeEntry.syncIndexes()
  console.log('indexes now:', (await col.indexes()).map((i) => i.name))

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
