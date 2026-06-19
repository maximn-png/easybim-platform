import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserGoogleToken, gmailCreateDraft } from '@/lib/services/gmailService'

interface DraftBody {
  to: string[]
  subject: string
  bodyHtml: string
  pdfBase64: string
  pdfName: string
  chartPngBase64?: string
  screenshotPngBase64?: string
}

// Wrap base64 at 76 chars per RFC 2045.
function wrap76(b64: string): string {
  return b64.replace(/.{76}/g, '$&\r\n')
}
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
// RFC 2047 encoded-word for non-ASCII headers
const encodeHeader = (s: string) => `=?UTF-8?B?${b64(s)}?=`

function buildMime(d: DraftBody): string {
  const MIXED = 'mixed_easybim_boundary'
  const REL = 'rel_easybim_boundary'
  const NL = '\r\n'

  const related: string[] = []
  // HTML body
  related.push(
    `--${REL}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(d.bodyHtml)),
  )
  // Inline chart
  if (d.chartPngBase64) {
    related.push(
      `--${REL}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <chart@easybim>',
      'Content-Disposition: inline; filename="chart.png"',
      '',
      wrap76(d.chartPngBase64),
    )
  }
  // Inline screenshot
  if (d.screenshotPngBase64) {
    related.push(
      `--${REL}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <screenshot@easybim>',
      'Content-Disposition: inline; filename="screenshot.png"',
      '',
      wrap76(d.screenshotPngBase64),
    )
  }
  related.push(`--${REL}--`)

  const lines: string[] = [
    `To: ${d.to.join(', ')}`,
    `Subject: ${encodeHeader(d.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${MIXED}"`,
    '',
    `--${MIXED}`,
    `Content-Type: multipart/related; boundary="${REL}"`,
    '',
    ...related,
    `--${MIXED}`,
    'Content-Type: application/pdf',
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${d.pdfName}"`,
    '',
    wrap76(d.pdfBase64),
    `--${MIXED}--`,
  ]

  return lines.join(NL)
}

function toBase64Url(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await getUserGoogleToken(userId)
  if (!token) return NextResponse.json({ needsGoogleAuth: true })

  let body: DraftBody
  try {
    body = await req.json() as DraftBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.to?.length) return NextResponse.json({ error: 'No recipients' }, { status: 400 })

  try {
    const raw = toBase64Url(buildMime(body))
    const { id } = await gmailCreateDraft(token, raw)
    return NextResponse.json({ draftId: id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 401/403 → token invalid or missing scope → ask the user to (re)connect Google
    if (msg.includes('401') || msg.includes('403') || msg.includes('insufficient')) {
      return NextResponse.json({ needsGoogleAuth: true })
    }
    console.error('[POST gmail-draft]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
