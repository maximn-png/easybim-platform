/**
 * Rerunnable, sibling of digestRevitDocs.ts — generates a transcript (+EN/HE
 * translation) for each Monday "Revit" > "Videos" item, via Gemini's video
 * understanding (see lib/integrations/gemini.ts's geminiTranscribeVideo).
 * Stored in the VideoTranscript collection; kc-app.js's openVideoPage fetches
 * it by driveId to render under the embedded Drive player.
 *
 * Same two-phase shape as digestRevitDocs.ts, for the same reason (PRD's
 * "semi-manual quality gate, not bulk import"): transcription quality on
 * jargon-heavy, code-switched (Hebrew/English) narration isn't something to
 * trust blind across all 29 videos before a human has read at least one.
 *
 *   npx tsx --env-file=.env.local scripts/digestRevitVideoTranscripts.ts validate
 *     -> transcribes ONLY the two target videos below and prints the full
 *        result (language + both translations) for a human check.
 *
 *   npx tsx --env-file=.env.local scripts/digestRevitVideoTranscripts.ts all
 *     -> transcribes every remaining video in the Videos group.
 */
import dns from 'node:dns'
dns.setServers(['8.8.8.8'])
import mongoose from 'mongoose'

import { connectDB } from '../lib/db/mongoose'
import { fetchVideosGroupItems, type VideosGroupItem } from '../lib/kc/mondaySync'
import { getDriveFileMeta, downloadDriveFile } from '../lib/integrations/googleDrive'
import { geminiTranscribeVideo } from '../lib/integrations/gemini'
import VideoTranscript from '../lib/models/VideoTranscript'

// One of the shortest ("Lesson 1", general concepts, likely closer to
// English-only) and one of the more MEP-jargon-dense, longer-sounding ones
// ("Electrical Equipment") — deliberately not two easy, similar clips.
const VALIDATION_FIRST = ['VXXXX - Lesson 1', 'VXXXX - Electrical Equipment']

const MAX_VIDEO_BYTES = 500 * 1024 * 1024 // Gemini Files API caps at 2GB; this is a saner ceiling for a tutorial screen-recording

async function digestOne(item: VideosGroupItem) {
  const meta = await getDriveFileMeta(item.driveId)
  if (meta.sizeBytes && meta.sizeBytes > MAX_VIDEO_BYTES) {
    console.log(`  SKIP    ${item.name}: ${Math.round(meta.sizeBytes / 1024 / 1024)}MB exceeds the ${MAX_VIDEO_BYTES / 1024 / 1024}MB cap`)
    return
  }
  const bytes = await downloadDriveFile(item.driveId)
  const mimeType = meta.mimeType || 'video/mp4'
  const result = await geminiTranscribeVideo(bytes, mimeType)

  await VideoTranscript.findOneAndUpdate(
    { driveId: item.driveId },
    {
      driveId: item.driveId,
      status: 'ready',
      errorMessage: undefined,
      language: result.language,
      textOriginal: result.textOriginal,
      textEn: result.textEn,
      textHe: result.textHe,
    },
    { upsert: true }
  )
  console.log(`  ready   ${item.name}  (lang=${result.language}, ${result.textOriginal.length} chars)`)
}

async function main() {
  const mode = process.argv[2]
  if (mode !== 'validate' && mode !== 'all') {
    console.error('Usage: tsx scripts/digestRevitVideoTranscripts.ts <validate|all>')
    process.exit(1)
  }

  await connectDB()
  console.log('Connected to MongoDB.')

  const items = await fetchVideosGroupItems()
  console.log(`Monday: ${items.length} items in "Videos" carry a Google Drive video file.\n`)

  const targets = mode === 'validate' ? items.filter((i) => VALIDATION_FIRST.includes(i.name)) : items
  if (mode === 'validate') console.log(`Validating ${targets.length} of ${VALIDATION_FIRST.length} target video(s):`)

  for (const item of targets) {
    console.log(`\n=== ${item.name} (${item.driveId}) ===`)
    try {
      await digestOne(item)
    } catch (err) {
      console.log(`  ERROR   ${item.name}: ${(err as Error).message}`)
      await VideoTranscript.findOneAndUpdate(
        { driveId: item.driveId },
        { driveId: item.driveId, status: 'error', errorMessage: (err as Error).message },
        { upsert: true }
      )
    }
  }

  if (mode === 'validate') {
    console.log('\n--- full results, for review ---')
    const saved = await VideoTranscript.find({ driveId: { $in: targets.map((i) => i.driveId) } }).lean()
    for (const t of saved) {
      console.log(`\n### ${t.driveId} — status=${t.status} lang=${t.language}`)
      if (t.status === 'ready') {
        console.log('-- original --\n' + t.textOriginal)
        console.log('-- EN --\n' + t.textEn)
        console.log('-- HE --\n' + t.textHe)
      } else {
        console.log('error: ' + t.errorMessage)
      }
    }
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
