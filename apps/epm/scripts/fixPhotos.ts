/**
 * Finds all projects where team members have a name but no mondayId/avatarUrl,
 * fetches their MA-003 data + Monday user photos, and patches MongoDB.
 *
 * Run with:
 *   cd C:\easybim-platform\apps\epm
 *   npx tsx --env-file=.env.local scripts/fixPhotos.ts
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!
const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN!
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1) }
if (!MONDAY_TOKEN) { console.error('MONDAY_API_TOKEN not set'); process.exit(1) }

const MONDAY_URL = 'https://api.monday.com/v2'

async function mondayQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(MONDAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data
}

const ProjectSchema = new mongoose.Schema({ projectNumber: String, externalIds: Object, snapshot: Object }, { timestamps: true })
const Project = mongoose.models.Project ?? mongoose.model('Project', ProjectSchema)

async function run() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  // Find all projects where any team member has no mondayId
  const docs = await Project.find({
    $or: [
      { 'snapshot.bimManager': { $exists: true }, 'snapshot.bimManager.mondayId': { $exists: false } },
      { 'snapshot.mepCoordinator': { $exists: true }, 'snapshot.mepCoordinator.mondayId': { $exists: false } },
      { 'snapshot.bimModeller': { $exists: true }, 'snapshot.bimModeller.mondayId': { $exists: false } },
    ]
  }).lean() as Array<{
    _id: unknown
    projectNumber: string
    externalIds: { ma003ItemId?: string }
    snapshot: {
      bimManager?: { name: string; mondayId?: string }
      mepCoordinator?: { name: string; mondayId?: string }
      bimModeller?: { name: string; mondayId?: string }
    }
  }>

  console.log(`Found ${docs.length} projects with missing mondayId on team members`)

  // Collect unique ma003ItemIds that need fixing
  const ma003Ids = [...new Set(docs.map(d => d.externalIds?.ma003ItemId).filter(Boolean) as string[])]
  console.log(`Fetching MA-003 data for ${ma003Ids.length} items...`)

  // Fetch MA-003 people data in batches of 50
  const ma003Map = new Map<string, { bimManager?: string; mepCoordinator?: string; bimModeller?: string }>()
  const BATCH = 50
  for (let i = 0; i < ma003Ids.length; i += BATCH) {
    const batch = ma003Ids.slice(i, i + BATCH)
    const data = await mondayQuery(
      `query($ids:[ID!]!){items(ids:$ids){id column_values(ids:["multiple_person_mkpsmr4k","multiple_person_mkpskxyf","multiple_person_mm2tw6be"]){id value}}}`,
      { ids: batch }
    ) as { items: Array<{ id: string; column_values: Array<{ id: string; value: string }> }> }

    for (const item of data.items ?? []) {
      const col = Object.fromEntries(item.column_values.map(c => [c.id, c.value]))
      const getId = (val: string) => {
        try { return String(JSON.parse(val)?.personsAndTeams?.[0]?.id ?? '') || undefined } catch { return undefined }
      }
      ma003Map.set(item.id, {
        bimManager:     getId(col['multiple_person_mkpsmr4k'] ?? ''),
        mepCoordinator: getId(col['multiple_person_mkpskxyf'] ?? ''),
        bimModeller:    getId(col['multiple_person_mm2tw6be'] ?? ''),
      })
    }
  }

  // Collect all unique mondayIds and fetch photos + names
  const allMondayIds = [...new Set([...ma003Map.values()].flatMap(m => [m.bimManager, m.mepCoordinator, m.bimModeller].filter(Boolean) as string[]))]
  console.log(`Fetching photos for ${allMondayIds.length} Monday users...`)

  const photoMap = new Map<string, { name: string; avatarUrl?: string }>()
  for (let i = 0; i < allMondayIds.length; i += 100) {
    const batch = allMondayIds.slice(i, i + 100)
    const data = await mondayQuery(
      `query($ids:[ID!]!){users(ids:$ids){id name photo_thumb_small}}`,
      { ids: batch }
    ) as { users: Array<{ id: string; name: string; photo_thumb_small: string | null }> }

    for (const u of data.users ?? []) {
      photoMap.set(String(u.id), { name: u.name, avatarUrl: u.photo_thumb_small ?? undefined })
    }
  }

  // Patch each project
  let updated = 0
  const toMember = (mondayId?: string) => {
    if (!mondayId) return undefined
    const u = photoMap.get(mondayId)
    if (!u) return undefined
    return { name: u.name, mondayId, avatarUrl: u.avatarUrl }
  }

  for (const doc of docs) {
    const ma003Id = doc.externalIds?.ma003ItemId
    if (!ma003Id) continue
    const members = ma003Map.get(ma003Id)
    if (!members) continue

    const patch: Record<string, unknown> = {}
    if (!doc.snapshot.bimManager?.mondayId && members.bimManager) {
      const m = toMember(members.bimManager)
      if (m) patch['snapshot.bimManager'] = m
    }
    if (!doc.snapshot.mepCoordinator?.mondayId && members.mepCoordinator) {
      const m = toMember(members.mepCoordinator)
      if (m) patch['snapshot.mepCoordinator'] = m
    }
    if (!doc.snapshot.bimModeller?.mondayId && members.bimModeller) {
      const m = toMember(members.bimModeller)
      if (m) patch['snapshot.bimModeller'] = m
    }

    if (Object.keys(patch).length > 0) {
      await Project.updateOne({ _id: doc._id }, { $set: patch })
      updated++
      process.stdout.write(`\r${updated} patched`)
    }
  }

  console.log(`\nDone. ${updated} projects patched.`)
  await mongoose.disconnect()
}

run().catch(err => { console.error(err); process.exit(1) })
