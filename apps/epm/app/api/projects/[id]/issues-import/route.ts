import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { parseIssuesWorkbook, openIssueCount } from '@/lib/issueImport'

// Accepts an ACC issues export (XLSX/CSV) for an external-hub project, parses it
// into AccIssue[], and stores it (replacing any prior import). The reports page
// then reads it via GET /api/projects/[id]/issues — identical to API projects.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded (field "file")' }, { status: 400 })
  }

  let parsed
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseIssuesWorkbook(buf)
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read spreadsheet: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    )
  }

  if (parsed.issues.length === 0) {
    return NextResponse.json(
      { error: 'No issues found — check this is an ACC issues export with a header row (ID, Title, Status…).' },
      { status: 422 }
    )
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ ok: true, mock: true, count: parsed.issues.length, fileName: file.name })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const IssueImport = (await import('@/app/models/IssueImport')).default
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    let uploadedByName: string | undefined
    try {
      const u = await currentUser()
      uploadedByName = [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.username || undefined
    } catch { /* best-effort */ }

    const uploadedAt = new Date()
    await IssueImport.findOneAndUpdate(
      { projectId: id },
      {
        $set: {
          issues:   parsed.issues,
          fileName: file.name,
          count:    parsed.issues.length,
          uploadedByName,
          uploadedAt,
        },
      },
      { upsert: true, new: true }
    )

    // Reflect the imported open-issue count on the dashboard.
    await Project.findByIdAndUpdate(id, {
      $set: {
        'snapshot.openIssuesCount': openIssueCount(parsed.issues),
        'snapshot.accLastSyncedAt': uploadedAt,
      },
    })

    return NextResponse.json({
      ok: true,
      count: parsed.issues.length,
      fileName: file.name,
      uploadedAt: uploadedAt.toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/projects/[id]/issues-import]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// Returns metadata about the current import (no issues payload) for the card.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ imported: false })

  try {
    const { connectDB } = await import('@easybim/db')
    const IssueImport = (await import('@/app/models/IssueImport')).default
    await connectDB()

    const doc = await IssueImport.findOne({ projectId: id })
      .select('count fileName uploadedByName uploadedAt')
      .lean() as Record<string, unknown> | null

    if (!doc) return NextResponse.json({ imported: false })

    return NextResponse.json({
      imported:       true,
      count:          doc.count ?? 0,
      fileName:       doc.fileName ?? '',
      uploadedByName: doc.uploadedByName ?? null,
      uploadedAt:     doc.uploadedAt ? new Date(doc.uploadedAt as string).toISOString() : null,
    })
  } catch (err) {
    console.error('[GET /api/projects/[id]/issues-import]', err)
    return NextResponse.json({ error: 'Failed to load import' }, { status: 500 })
  }
}
