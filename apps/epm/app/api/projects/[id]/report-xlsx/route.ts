import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { AccIssue } from '@/lib/services/apsService'

export const runtime = 'nodejs'

interface Body {
  issues: AccIssue[]
  xlsxName?: string
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!Array.isArray(body.issues)) {
    return NextResponse.json({ error: 'Missing issues' }, { status: 400 })
  }

  try {
    const { generateReportXlsx } = await import('@/lib/server/reportXlsx')
    const xlsx = await generateReportXlsx(body.issues)
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `inline; filename="${body.xlsxName || 'report.xlsx'}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[report-xlsx]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
