// Server-side PDF generation for the BIM report. Renders the report HTML with
// headless Chromium (vector text + real page breaks), so the output is crisp and
// no table row is split across a page boundary.
//   - Vercel/serverless: @sparticuz/chromium
//   - Local dev: the machine's installed Chrome (override with CHROME_EXECUTABLE_PATH)
import 'server-only'
import type { AccIssue } from '@/lib/services/apsService'
import { buildReportHtml, type ReportMeta } from './reportHtml'
import { ASSISTANT_FONT_B64, LOGO_PNG_B64 } from './reportAssets'

const FONT_CSS = `@font-face {
  font-family: 'Assistant';
  src: url(data:font/ttf;base64,${ASSISTANT_FONT_B64}) format('truetype');
  font-weight: 200 800; font-style: normal; font-display: block;
}`
const LOGO_SRC = `data:image/png;base64,${LOGO_PNG_B64}`

function defaultLocalChrome(): string {
  switch (process.platform) {
    case 'win32':  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    default:       return '/usr/bin/google-chrome'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function launchBrowser(): Promise<any> {
  const serverless = !!process.env.VERCEL || !!process.env.AWS_REGION || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  const puppeteer = (await import('puppeteer-core')).default
  if (serverless) {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || defaultLocalChrome(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

export async function generateReportPdf(meta: ReportMeta, issues: AccIssue[]): Promise<Buffer> {
  const html = buildReportHtml(meta, issues, { fontCss: FONT_CSS, logoSrc: LOGO_SRC })

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    try { await page.evaluate(() => (document as Document).fonts.ready) } catch { /* best-effort */ }
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#9ca3af;text-align:center;padding:0 8px">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
