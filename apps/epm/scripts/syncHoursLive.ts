/**
 * One-off / ad-hoc backfill: compute live actual hours from the timesheet boards
 * (TS-001/003/004/005) and write snapshot.actualHours + snapshot.hoursProgress
 * for every project that has an MA-003 item id. This is the same logic the
 * hourly sync (/api/sync/projects) now runs — use it to populate immediately
 * without waiting for a deploy/cron.
 *
 * Run with:
 *   cd C:\easybim-platform\apps\epm
 *   npx tsx --env-file=.env.local scripts/syncHoursLive.ts
 */

import mongoose from 'mongoose'
import { fetchAllTimesheetHours } from '../lib/services/mondayService'

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1) }
if (!process.env.MONDAY_API_TOKEN) { console.error('MONDAY_API_TOKEN not set'); process.exit(1) }

const ProjectSchema = new mongoose.Schema({
  projectNumber: { type: String, required: true },
  externalIds:   { type: Object, required: true },
  snapshot:      { type: Object, default: () => ({}) },
}, { timestamps: true })
const Project = mongoose.models.Project ?? mongoose.model('Project', ProjectSchema)

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)) }

async function main() {
  console.log('Fetching timesheet hours from TS-001/003/004/005 ...')
  const hours = await fetchAllTimesheetHours()
  console.log(`Got hours for ${hours.size} MA-003 ids`)

  await mongoose.connect(MONGODB_URI!)
  console.log('Connected to MongoDB')

  const docs = await Project.find({}).lean() as Array<{
    _id: unknown; projectNumber: string
    externalIds: { ma003ItemId?: string }
    snapshot: { budgetHours?: number | null }
  }>
  console.log(`Found ${docs.length} projects`)

  let updated = 0, noMa003 = 0, noHours = 0
  for (const doc of docs) {
    const ma003Id = doc.externalIds?.ma003ItemId
    if (!ma003Id) { noMa003++; continue }

    const actualHours = hours.get(ma003Id)?.actualHours ?? null
    if (actualHours == null) { noHours++; continue }

    const budget = doc.snapshot?.budgetHours ?? null
    const hoursProgress = budget && budget > 0
      ? clamp(Math.round((actualHours / budget) * 100), 0, 999)
      : null

    await Project.updateOne({ _id: doc._id }, {
      $set: {
        'snapshot.actualHours':   Math.round(actualHours * 100) / 100,
        'snapshot.hoursProgress': hoursProgress,
      },
    })
    updated++
  }

  console.log(`\nDone. Updated: ${updated}, no MA-003 id: ${noMa003}, no hours: ${noHours}`)
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
