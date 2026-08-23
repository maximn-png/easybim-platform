import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { logAppVisit } from '@easybim/db'

// Serves the Knowledge Center frontend (design handoff bundle) as a raw HTML
// document. A Route Handler — not a page.tsx — so it owns its own <html>/<head>/
// <body> instead of being wrapped by the root layout's ClerkProvider shell.
// Static assets it depends on (kc-*.js, design tokens, figures) live under
// public/kc/ and are referenced via the <base href="/kc/"> tag baked into the
// template at build time. This route itself still goes through proxy.ts's
// Clerk auth gate, since only literal .html/.js/.css/image URLs are excluded
// from its matcher — "/" is not.
let cachedHtml: string | null = null

// Clerk session tokens expire every 60 seconds and are normally kept fresh
// by clerk-js in the browser. This page bypasses the root layout's
// ClerkProvider, so without these tags nothing ever refreshes the session
// cookie — every API call made more than ~60s after page load was 307'd
// into Clerk's handshake by proxy.ts, and the mentor/state calls failed
// with generic errors. Loading bare clerk-js (no UI, just Clerk.load())
// restores the refresh loop. Config mirrors what @clerk/nextjs reads from
// env in the other apps; the frontend-API host is decoded from the
// publishable key (its base64 payload is the host + '$').
function clerkBootTags(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!pk) return ''
  let frontendApi = ''
  try {
    frontendApi = Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '')
  } catch {
    return ''
  }
  if (!frontendApi) return ''
  const options: Record<string, unknown> = {}
  if (process.env.NEXT_PUBLIC_CLERK_IS_SATELLITE === 'true') options.isSatellite = true
  if (process.env.NEXT_PUBLIC_CLERK_DOMAIN) options.domain = process.env.NEXT_PUBLIC_CLERK_DOMAIN
  if (process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL) options.signInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL
  if (process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL) options.signUpUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL
  // After load, also force a token refresh every 45s via getToken() — a
  // belt-and-braces guarantee on top of clerk-js's own cookie poller (the
  // session token expires at 60s). The console lines make the keepalive's
  // health visible in the browser devtools when debugging auth issues.
  const boot =
    'window.__kcClerkInit=function(){' +
    `window.Clerk.load(${JSON.stringify(options)}).then(function(){` +
    "console.log('kc: clerk session keepalive active');" +
    'setInterval(function(){try{if(window.Clerk&&window.Clerk.session){window.Clerk.session.getToken().catch(function(e){' +
    "console.error('kc: clerk token refresh failed',e)})}}catch(e){}},45000)" +
    "}).catch(function(e){console.error('kc: clerk-js load failed',e)})}"
  return (
    `<script>${boot}</script>` +
    `<script async crossorigin="anonymous" data-clerk-publishable-key="${pk}" src="https://${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js" onload="window.__kcClerkInit()"></script>`
  )
}

// Cached in production only — the file is immutable for the life of a
// deploy there, so re-reading it on every request would be pure waste. In
// dev, the server process runs for hours across many edits to this file;
// caching it would mean every template.html change needs a manual restart
// to ever be served.
async function loadHtml() {
  if (cachedHtml && process.env.NODE_ENV === 'production') return cachedHtml
  const filePath = path.join(process.cwd(), 'lib/kc/template.html')
  const raw = await readFile(filePath, 'utf8')
  // Replacement is a function so '$'-sequences in the tags can't be
  // interpreted as replace() patterns.
  const html = raw.replace('</head>', () => `${clerkBootTags()}</head>`)
  cachedHtml = html
  return html
}

export async function GET() {
  // Mirrors the activity-log call the root layout makes for every other route —
  // this one bypasses that layout, so it needs its own.
  const { userId } = await auth()
  if (userId) await logAppVisit(userId, 'knowledge').catch(() => {})

  const html = await loadHtml()
  return new NextResponse(html, {
    // This has changed several times during development while the browser
    // kept a prior response around — rule that variable out entirely rather
    // than rely on a plain refresh to notice.
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
