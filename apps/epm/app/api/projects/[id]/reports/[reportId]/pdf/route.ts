import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { guardSharedProjectForAna } from '@/lib/server/anaAccess'

// Streams the stored PDF bytes for embedding / download in the report view.
export async function GET(
  req: NextRequest,
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
      .select('pdf pdfName')
      .lean() as { pdf?: unknown; pdfName?: string } | null
    if (!d?.pdf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // A Node Buffer also exposes a `.buffer` (its underlying ArrayBuffer pool),
    // so test isBuffer FIRST; only fall back to the BSON Binary's `.buffer` field.
    const pdf = d.pdf
    let bytes: Buffer
    if (Buffer.isBuffer(pdf)) {
      bytes = pdf
    } else if (pdf && typeof pdf === 'object' && Buffer.isBuffer((pdf as { buffer?: unknown }).buffer)) {
      bytes = (pdf as { buffer: Buffer }).buffer
    } else {
      bytes = Buffer.from(pdf as Uint8Array)
    }
    const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'
    const filename = (d.pdfName || 'report.pdf').replace(/"/g, '')

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Content-Length': String(bytes.length),
      },
    })
  } catch (err) {
    console.error('[GET /api/projects/[id]/reports/[reportId]/pdf]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
