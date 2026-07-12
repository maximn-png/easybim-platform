import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

// Lightweight report history for a project (metadata only — no PDF / HTML).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ reports: [] })

  try {
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    const docs = await Report.find({ projectId: id })
      .select('title subject recipients draftId gmailUrl issueCount createdByName createdAt issuesSnapshot')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean() as unknown as Array<Record<string, unknown>>

    const reports = docs.map(d => ({
      _id: String(d._id),
      title: d.title as string,
      subject: d.subject as string,
      recipients: (d.recipients as string[]) ?? [],
      draftId: d.draftId as string | undefined,
      gmailUrl: d.gmailUrl as string | undefined,
      issueCount: d.issueCount as number | undefined,
      createdByName: d.createdByName as string | undefined,
      createdAt: d.createdAt ? new Date(d.createdAt as string).toISOString() : null,
      // Same flag the project page computes server-side — keeps this route's
      // shape consistent with ReportListItem (Progress modal eligibility).
      hasSnapshot: Array.isArray(d.issuesSnapshot) && d.issuesSnapshot.length > 0,
    }))

    return NextResponse.json({ reports })
  } catch (err) {
    console.error('[GET /api/projects/[id]/reports]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
