import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { guardSharedProjectForAna } from '@/lib/server/anaAccess'

// Full report (email preview HTML + metadata) for the view modal. The PDF bytes
// are served separately by ./pdf to keep this payload light.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, reportId } = await params

  const denied = await guardSharedProjectForAna('GET', id)
  if (denied) return denied
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    const d = await Report.findOne({ _id: reportId, projectId: id })
      .select('kind title subject recipients previewHtml pdfName draftId gmailUrl issueCount filtersSummary createdByName createdAt')
      .lean() as Record<string, unknown> | null
    if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      report: {
        _id: String(d._id),
        kind: (d.kind as 'email' | 'internal') ?? (((d.recipients as string[])?.length ?? 0) > 0 ? 'email' : 'internal'),
        title: d.title as string,
        subject: d.subject as string,
        recipients: (d.recipients as string[]) ?? [],
        previewHtml: d.previewHtml as string,
        pdfName: d.pdfName as string,
        draftId: d.draftId as string | undefined,
        gmailUrl: d.gmailUrl as string | undefined,
        issueCount: d.issueCount as number | undefined,
        filtersSummary: d.filtersSummary as string | undefined,
        createdByName: d.createdByName as string | undefined,
        createdAt: d.createdAt ? new Date(d.createdAt as string).toISOString() : null,
      },
    })
  } catch (err) {
    console.error('[GET /api/projects/[id]/reports/[reportId]]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, reportId } = await params

  // ANA-only clients are read-only — the guard rejects their non-GET requests.
  const denied = await guardSharedProjectForAna('DELETE', id)
  if (denied) return denied

  if (!process.env.MONGODB_URI) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    const res = await Report.deleteOne({ _id: reportId, projectId: id })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/projects/[id]/reports/[reportId]]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
