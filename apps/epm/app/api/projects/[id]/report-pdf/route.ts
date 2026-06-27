import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { AccIssue } from '@/lib/services/apsService'
import type { ReportMeta } from '@/lib/server/reportHtml'

// Headless Chromium needs a Node runtime and time to spin up / paginate.
export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  meta: ReportMeta
  issues: AccIssue[]
  pdfName?: string
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.meta || !Array.isArray(body.issues)) {
    return NextResponse.json({ error: 'Missing meta/issues' }, { status: 400 })
  }

  try {
    const { generateReportPdf } = await import('@/lib/server/reportPdfServer')
    const pdf = await generateReportPdf(body.meta, body.issues)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${body.pdfName || 'report.pdf'}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[report-pdf]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
