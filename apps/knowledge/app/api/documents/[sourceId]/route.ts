import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Document from '@/lib/models/Document'

// GET /api/documents/:sourceId — the digest cache KC.API.getDocument reads.
// Returns the stored copy if one exists, `not_imported` otherwise. The front
// end never decides which — see design_handoff_knowledge_center_backend/spec/API Endpoints.md.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sourceId } = await params
  await connectDB()
  const doc = await Document.findOne({ sourceDocId: sourceId }).lean()

  if (!doc) {
    return NextResponse.json({ status: 'not_imported', sourceUrl: '' })
  }
  if (doc.status === 'error') {
    return NextResponse.json({ status: 'error', message: doc.errorMessage, sourceUrl: doc.sourceUrl })
  }
  if (doc.status === 'importing') {
    return NextResponse.json({ status: 'importing', progress: 0 })
  }

  return NextResponse.json({
    status: 'ready',
    doc: {
      id: doc.sourceDocId,
      sourceId: doc.sourceDocId,
      title: doc.title,
      version: doc.version,
      blocks: doc.blocks,
      toc: doc.toc,
      links: doc.links,
      versionHistory: doc.versionHistory,
      digestIssues: doc.digestIssues,
    },
  })
}
