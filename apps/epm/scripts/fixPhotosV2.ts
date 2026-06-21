/**
 * Patches all team member records in MongoDB that have a name but no mondayId,
 * using a pre-built name→{mondayId, avatarUrl} lookup from Monday.
 *
 * Run with:
 *   cd C:\easybim-platform\apps\epm
 *   npx tsx --env-file=.env.local scripts/fixPhotosV2.ts
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1) }

// All known team members extracted from Monday via MCP
const KNOWN_USERS: Record<string, { mondayId: string; avatarUrl: string }> = {
  'Gal Shem-Tov':          { mondayId: '56365738',  avatarUrl: 'https://files.monday.com/use1/photos/56365738/thumb_small/56365738-user_photo_2025_02_09_09_24_29.png?1739093069' },
  'Guy Cohen':              { mondayId: '79907897',  avatarUrl: 'https://files.monday.com/use1/photos/79907897/thumb_small/79907897-user_photo_2025_08_25_13_01_55.png?1756126916' },
  'Yamit bettman':          { mondayId: '51019599',  avatarUrl: 'https://files.monday.com/use1/photos/51019599/thumb_small/51019599-user_photo_2023_11_06_07_26_57.png?1699255617' },
  'Reut Hefetz':            { mondayId: '26782349',  avatarUrl: 'https://files.monday.com/use1/photos/26782349/thumb_small/26782349-user_photo_2022_01_08_10_47_18.png?1641638838' },
  'Aleksandra Zhuikova':    { mondayId: '63711548',  avatarUrl: 'https://files.monday.com/use1/photos/63711548/thumb_small/63711548-user_photo_2024_07_21_13_15_08.png?1721567709' },
  'Ethan Berry':            { mondayId: '99884041',  avatarUrl: 'https://files.monday.com/use1/photos/99884041/thumb_small/99884041-user_photo_2026_03_01_13_13_20.png?1772370800' },
  'Lilina Priyadarshini':   { mondayId: '100767403', avatarUrl: 'https://files.monday.com/use1/photos/100767403/thumb_small/100767403-user_photo_2026_04_23_13_31_12.png?1776951072' },
  'Miri Label':             { mondayId: '33501625',  avatarUrl: 'https://files.monday.com/use1/photos/33501625/thumb_small/33501625-user_photo_2022_08_22_16_24_10.png?1661185450' },
  'Bayan abu awad':         { mondayId: '33187385',  avatarUrl: 'https://files.monday.com/use1/photos/33187385/thumb_small/33187385-user_photo_2023_09_05_08_45_01.png?1693903501' },
  'Maxim Naftaliyv':        { mondayId: '26773504',  avatarUrl: 'https://files.monday.com/use1/photos/26773504/thumb_small/26773504-user_photo_2022_01_02_06_29_16.png?1641104956' },
  'Anton Kaganovich':       { mondayId: '102449578', avatarUrl: 'https://files.monday.com/use1/photos/102449578/thumb_small/102449578-user_photo_2026_04_21_06_47_31.png?1776754051' },
}

const ProjectSchema = new mongoose.Schema({ projectNumber: String, snapshot: Object }, { timestamps: true, strict: false })
const Project = mongoose.models.Project ?? mongoose.model('Project', ProjectSchema)

function patch(member: { name?: string; mondayId?: string } | null | undefined) {
  if (!member || member.mondayId) return null  // already has mondayId or no member
  const user = member.name ? KNOWN_USERS[member.name] : undefined
  if (!user) return null
  return { name: member.name, mondayId: user.mondayId, avatarUrl: user.avatarUrl }
}

async function run() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const docs = await Project.find({
    $or: [
      { 'snapshot.bimManager.name': { $exists: true }, 'snapshot.bimManager.mondayId': { $exists: false } },
      { 'snapshot.mepCoordinator.name': { $exists: true }, 'snapshot.mepCoordinator.mondayId': { $exists: false } },
      { 'snapshot.bimModeller.name': { $exists: true }, 'snapshot.bimModeller.mondayId': { $exists: false } },
    ]
  }).lean() as Array<{ _id: unknown; projectNumber: string; snapshot: { bimManager?: { name?: string; mondayId?: string } | null; mepCoordinator?: { name?: string; mondayId?: string } | null; bimModeller?: { name?: string; mondayId?: string } | null } }>

  console.log(`Found ${docs.length} projects to patch`)
  let updated = 0

  for (const doc of docs) {
    const set: Record<string, unknown> = {}

    const bm = patch(doc.snapshot.bimManager)
    const mep = patch(doc.snapshot.mepCoordinator)
    const mod = patch(doc.snapshot.bimModeller)

    if (bm)  set['snapshot.bimManager']    = bm
    if (mep) set['snapshot.mepCoordinator'] = mep
    if (mod) set['snapshot.bimModeller']    = mod

    if (Object.keys(set).length > 0) {
      await Project.updateOne({ _id: doc._id }, { $set: set })
      updated++
      process.stdout.write(`\r${updated} patched`)
    }
  }

  console.log(`\nDone. ${updated} projects patched.`)
  await mongoose.disconnect()
}

run().catch(err => { console.error(err); process.exit(1) })
