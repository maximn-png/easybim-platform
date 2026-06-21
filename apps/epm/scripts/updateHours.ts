/**
 * Reads ts-hours.json (ma003ItemId → actualHours, aggregated from TS-001/003/004/005)
 * and updates MongoDB snapshot.actualHours + snapshot.hoursProgress for each project.
 *
 * Run with:
 *   cd C:\easybim-platform\apps\epm
 *   npx tsx --env-file=.env.local scripts/updateHours.ts
 */

import path from 'path'
import fs from 'fs'
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1) }

// ── Load hours map ─────────────────────────────────────────────────────────

const hoursPath = path.join(__dirname, '..', 'lib', 'ts-hours.json')
if (!fs.existsSync(hoursPath)) {
  console.error(`ts-hours.json not found at ${hoursPath}`)
  process.exit(1)
}

const hoursMap: Record<string, number> = JSON.parse(fs.readFileSync(hoursPath, 'utf-8'))
console.log(`Loaded hours for ${Object.keys(hoursMap).length} MA-003 IDs`)

// ── Mongoose model (inline) ────────────────────────────────────────────────

const ProjectSchema = new mongoose.Schema({
  projectNumber:  { type: String, required: true },
  externalIds:    { type: Object, required: true },
  snapshot:       { type: Object, default: () => ({}) },
}, { timestamps: true })

ProjectSchema.index({ projectNumber: 1 }, { unique: true })

const Project = mongoose.models.Project ?? mongoose.model('Project', ProjectSchema)

// ── Update ─────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

async function update() {
  await mongoose.connect(MONGODB_URI!)
  console.log('Connected to MongoDB')

  const docs = await Project.find({}).lean() as Array<{
    _id: unknown
    projectNumber: string
    externalIds: { ma003ItemId?: string }
    snapshot: { budgetHours?: number | null }
  }>

  console.log(`Found ${docs.length} projects in MongoDB`)

  let updated = 0
  let skipped = 0
  let noHours = 0

  for (const doc of docs) {
    const ma003Id = doc.externalIds?.ma003ItemId
    if (!ma003Id) { skipped++; continue }

    const actualHours = hoursMap[ma003Id] ?? null
    if (actualHours === null) { noHours++; continue }

    const budgetHours = doc.snapshot?.budgetHours ?? null
    const hoursProgress =
      actualHours !== null && budgetHours && budgetHours > 0
        ? clamp(Math.round((actualHours / budgetHours) * 100), 0, 999)
        : null

    await Project.updateOne(
      { _id: doc._id },
      {
        $set: {
          'snapshot.actualHours':  Math.round(actualHours * 100) / 100,
          'snapshot.hoursProgress': hoursProgress,
        },
      }
    )
    updated++
    process.stdout.write(`\r${updated} updated`)
  }

  console.log(`\nDone. Updated: ${updated}, no MA-003 ID: ${skipped}, no hours data: ${noHours}`)
  await mongoose.disconnect()
}

update().catch(err => { console.error(err); process.exit(1) })
