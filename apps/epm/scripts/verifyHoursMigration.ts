// Verifies the Monday→TimeEntry hours backfill: compares, per project, the
// live Monday timesheet totals against the imported TimeEntry totals so the
// analytics switch is approved with numbers.
//
//   cd apps/epm && npx tsx --env-file=.env.local scripts/verifyHoursMigration.ts
//
// Expected (legitimate) deltas:
//   - undated Monday rows (in Monday's raw total, skipped by the import)
//   - slots where a portal entry already occupied the unique key (portal wins)
//   - rounding at 0.01h
import mongoose, { Types } from 'mongoose'
import { fetchAllTimesheetHours } from '../lib/services/mondayService'
import TimeEntry from '../app/models/TimeEntry'
import Project from '../app/models/Project'

const round = (n: number) => Math.round(n * 100) / 100

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  await mongoose.connect(uri)

  const [mondayByMa003, projects, mongoMonday, mongoAll] = await Promise.all([
    fetchAllTimesheetHours(),
    Project.find({}, { projectName: 1, projectNumber: 1, 'externalIds.ma003ItemId': 1 }).lean() as unknown as Promise<Array<{
      _id: Types.ObjectId; projectName: string; projectNumber: string; externalIds?: { ma003ItemId?: string }
    }>>,
    TimeEntry.aggregate<{ _id: Types.ObjectId | null; hours: number }>([
      { $match: { source: 'monday' } },
      { $group: { _id: '$projectId', hours: { $sum: '$hours' } } },
    ]),
    TimeEntry.aggregate<{ _id: Types.ObjectId | null; hours: number }>([
      { $group: { _id: '$projectId', hours: { $sum: '$hours' } } },
    ]),
  ])

  const mongoMondayById = new Map(mongoMonday.filter(r => r._id).map(r => [String(r._id), r.hours]))
  const mongoAllById    = new Map(mongoAll.filter(r => r._id).map(r => [String(r._id), r.hours]))
  const internalMonday  = mongoMonday.find(r => !r._id)?.hours ?? 0

  console.log('project# | name                             | Monday raw | Mongo(monday) |      Δ | all sources')
  console.log('---------+----------------------------------+------------+---------------+--------+------------')

  let mondayTotal = 0, mongoTotal = 0, allTotal = 0, flagged = 0
  const rows = projects
    .map(p => {
      const monday = p.externalIds?.ma003ItemId ? mondayByMa003.get(p.externalIds.ma003ItemId)?.actualHours ?? 0 : 0
      const mongo  = mongoMondayById.get(String(p._id)) ?? 0
      const all    = mongoAllById.get(String(p._id)) ?? 0
      return { p, monday, mongo, all, delta: mongo - monday }
    })
    .filter(r => r.monday || r.mongo || r.all)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  for (const { p, monday, mongo, all, delta } of rows) {
    mondayTotal += monday; mongoTotal += mongo; allTotal += all
    const flag = Math.abs(delta) > 0.01 ? ' ← CHECK' : ''
    if (flag) flagged++
    console.log(
      `${p.projectNumber.padEnd(8)} | ${p.projectName.slice(0, 32).padEnd(32)} | ${String(round(monday)).padStart(10)} | ${String(round(mongo)).padStart(13)} | ${String(round(delta)).padStart(6)} | ${String(round(all)).padStart(10)}${flag}`
    )
  }

  // Monday's raw total includes rows linked to MA-003 items that are NOT EPM
  // projects (internal EasyBIM buckets → imported under projectKey 'internal').
  const mondayGrand = [...mondayByMa003.values()].reduce((s, v) => s + v.actualHours, 0)
  console.log('---------')
  console.log(`Projects with hours: ${rows.length}, per-project deltas > 0.01h: ${flagged}`)
  console.log(`Monday grand total (all MA-003 ids, incl. internal buckets): ${round(mondayGrand)}h`)
  console.log(`Mongo source:'monday' project total: ${round(mongoTotal)}h + internal ${round(internalMonday)}h = ${round(mongoTotal + internalMonday)}h`)
  console.log(`Mongo all-sources project total: ${round(allTotal)}h`)
  console.log(`Unexplained gap (Monday grand − Mongo monday-import grand): ${round(mondayGrand - mongoTotal - internalMonday)}h`)
  console.log('(expected gap sources: undated rows, rows with no matching EPM project — see the backfill report)')

  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
