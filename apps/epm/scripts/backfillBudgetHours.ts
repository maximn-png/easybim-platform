/**
 * One-off backfill: set snapshot.budgetHours = שכט סופי ÷ 300 (MA-004 formula8,
 * read via display_value) for every project. The hourly project sync keeps it
 * fresh going forward; this seeds it immediately.
 *
 *   cd C:\easybim-platform\apps\epm
 *   npx tsx --env-file=.env.local scripts/backfillBudgetHours.ts
 */
import mongoose from 'mongoose'
import { fetchActiveMA004Projects } from '../lib/services/mondayService'

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1) }

const Project = mongoose.models.Project ?? mongoose.model('Project', new mongoose.Schema({
  projectNumber: String,
  snapshot:      { type: Object, default: () => ({}) },
}, { timestamps: true, strict: false }))

async function main() {
  const projects = await fetchActiveMA004Projects()
  await mongoose.connect(MONGODB_URI!)
  console.log(`Connected. ${projects.length} MA-004 projects.`)

  let updated = 0, skipped = 0
  for (const p of projects) {
    if (!p.projectNumber || p.budgetHours == null) { skipped++; continue }
    const res = await Project.updateOne(
      { projectNumber: p.projectNumber },
      { $set: { 'snapshot.budgetHours': p.budgetHours } }
    )
    if (res.matchedCount > 0) updated++
    else skipped++
  }
  console.log(`Done. Updated: ${updated}, skipped: ${skipped}`)
  await mongoose.disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
