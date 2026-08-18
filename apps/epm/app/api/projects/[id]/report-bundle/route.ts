import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { AccIssue } from '@/lib/services/apsService'
import type { ExtraColumn } from '@/lib/reportGrouping'
import type { ReportMeta } from '@/lib/server/reportHtml'

// One ZIP with the report PDF + Excel. Used by the Export tab's "העתק לתשובה":
// browsers only reliably allow ONE automatic download per action (a second
// programmatic download gets silently throttled), so both attachments ship as
// a single archive.

export const runtime = 'nodejs'
export const maxDuration = 60

interface Body {
  meta: ReportMeta
  issues: AccIssue[]
  extraColumns?: ExtraColumn[]
  pdfName?: string
  xlsxName?: string
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
    const [{ generateReportPdf }, { generateReportXlsx }, { default: JSZip }] = await Promise.all([
      import('@/lib/server/reportPdfServer'),
      import('@/lib/server/reportXlsx'),
      import('jszip'),
    ])
    const pdfName  = body.pdfName  || 'report.pdf'
    const xlsxName = body.xlsxName || 'report.xlsx'
    const [pdf, xlsx] = await Promise.all([
      generateReportPdf(body.meta, body.issues),
      generateReportXlsx(body.issues, body.extraColumns ?? []),
    ])
    const zip = new JSZip()
    zip.file(pdfName, pdf)
    zip.file(xlsxName, xlsx)
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        // ASCII-safe fixed name — the client's <a download> sets the real one.
        'Content-Disposition': 'attachment; filename="report.zip"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[report-bundle]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
