import 'server-only'

// RFC 2822 assembly for report emails, shared by the interactive Export flow
// (Gmail draft) and the scheduler (draft or real send).
//
// Two image strategies, mirroring buildEmailHtml:
//   inlineImages = false → the HTML points at hosted https URLs (preferred; mail
//                          clients and Gmail's proxy load them reliably)
//   inlineImages = true  → chart/screenshot ride along as cid: related parts
//                          (fallback when the report couldn't be persisted, or
//                          the origin isn't publicly reachable, e.g. localhost)

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Wrap base64 at 76 chars per RFC 2045.
const wrap76 = (s: string) => s.replace(/.{76}/g, '$&\r\n')
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
// RFC 2047 for non-ASCII headers (Hebrew subjects).
const encodeHeader = (s: string) => `=?UTF-8?B?${b64(s)}?=`

export interface MimeInput {
  to: string[]
  subject: string
  bodyHtml: string
  pdf: Buffer
  pdfName: string
  xlsx: Buffer
  xlsxName: string
  chartPngBase64?: string
  screenshotPngBase64?: string
  inlineImages: boolean
}

export function buildReportMime(d: MimeInput): string {
  const MIXED = 'mixed_easybim_boundary'
  const REL = 'rel_easybim_boundary'
  const NL = '\r\n'

  let htmlBlock: string[]
  if (d.inlineImages && (d.chartPngBase64 || d.screenshotPngBase64)) {
    const related: string[] = [
      `--${REL}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <html@easybim>',
      '',
      wrap76(b64(d.bodyHtml)),
    ]
    if (d.chartPngBase64) {
      related.push(`--${REL}`, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64',
        'Content-ID: <chart@easybim>', 'Content-Disposition: inline; filename="chart.png"', '', wrap76(d.chartPngBase64))
    }
    if (d.screenshotPngBase64) {
      related.push(`--${REL}`, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64',
        'Content-ID: <screenshot@easybim>', 'Content-Disposition: inline; filename="screenshot.png"', '', wrap76(d.screenshotPngBase64))
    }
    related.push(`--${REL}--`)
    htmlBlock = [
      `--${MIXED}`,
      `Content-Type: multipart/related; type="text/html"; start="<html@easybim>"; boundary="${REL}"`,
      '',
      ...related,
    ]
  } else {
    htmlBlock = [
      `--${MIXED}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(b64(d.bodyHtml)),
    ]
  }

  const lines: string[] = [
    `To: ${d.to.join(', ')}`,
    `Subject: ${encodeHeader(d.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${MIXED}"`,
    '',
    ...htmlBlock,
    // PDF attachment
    `--${MIXED}`,
    'Content-Type: application/pdf',
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${d.pdfName}"`,
    '',
    wrap76(d.pdf.toString('base64')),
    // Excel attachment
    `--${MIXED}`,
    `Content-Type: ${XLSX_MIME}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${d.xlsxName}"`,
    '',
    wrap76(d.xlsx.toString('base64')),
    `--${MIXED}--`,
  ]

  return lines.join(NL)
}

export function toBase64Url(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
