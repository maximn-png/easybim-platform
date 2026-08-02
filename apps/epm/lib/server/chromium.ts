import 'server-only'

// Shared headless-Chromium launcher for every server-rendered artefact
// (report PDF, analytics chart PNG).
//   - Vercel/serverless: @sparticuz/chromium
//   - Local dev: the machine's installed Chrome (override with CHROME_EXECUTABLE_PATH)

function defaultLocalChrome(): string {
  switch (process.platform) {
    case 'win32':  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    default:       return '/usr/bin/google-chrome'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function launchBrowser(): Promise<any> {
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
