import path from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Document from '@/lib/models/Document'
import { digestBySourceId } from '@/lib/kc/digest'
import { reindexDocument } from '@/lib/kc/embeddings'

const FIGURES_DIR = path.join(process.cwd(), 'public', 'kc', 'assets', 'docpage')

// Writes figures as static files next to the app's own public assets — see
// lib/kc/digest.ts for why (kc-docpage.js hardcodes a static path, never an
// API call). Works in local dev; a real production "click to import" flow
// would need object storage instead, since a deployed serverless function's
// filesystem is read-only — this route is otherwise spec-complete but that
// gap is out of scope for the current batch (done via the local script).
async function materializeFigures(figures: Array<{ id: string; data: Buffer }>) {
  await mkdir(FIGURES_DIR, { recursive: true })
  await Promise.all(
    figures.map((f) => writeFile(path.join(FIGURES_DIR, `${f.id}.png`), f.data).catch(() => {}))
  )
}

// POST /api/documents/:sourceId/import — "Import into Knowledge Center". Runs
// the shared digest converter and upserts the stored copy. See
// design_handoff_knowledge_center_backend/spec/API Endpoints.md section 3.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sourceId } = await params
  await connectDB()

  let record = await Document.findOne({ sourceDocId: sourceId })
  if (!record) {
    record = await Document.create({
      sourceDocId: sourceId,
      workspaceId: 'ws1',
      title: sourceId,
      status: 'importing',
    })
  } else {
    record.status = 'importing'
    await record.save()
  }

  const result = await digestBySourceId(sourceId, record._id, record.title)

  if (!result.ok) {
    record.status = 'error'
    record.errorMessage = result.errorMessage
    await record.save()
    return NextResponse.json({ status: 'error', message: result.errorMessage })
  }

  const codeMatch = /^([A-Z]{1,6}\d{0,4}|\d{4,6})\b/.exec(result.title)
  record.title = result.title
  record.code = codeMatch?.[1]
  record.series = record.series || 'Revit'
  record.status = 'ready'
  record.blocks = result.blocks
  record.toc = result.toc
  record.versionHistory = result.versionHistory
  record.digestIssues = result.digestIssues
  record.importedAt = new Date()
  record.version = (record.version ?? 0) + 1
  await record.save()
  await materializeFigures(result.figures)
  // Best-effort: the Mentor's search index lagging behind a fresh import is
  // recoverable (rerun the backfill script), a failed import response isn't.
  await reindexDocument(sourceId).catch((err) => console.error('[import] reindex failed:', err))

  return NextResponse.json({
    status: 'ready',
    progress: 1,
    digestIssues: result.digestIssues,
  })
}
