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

// Cached in production only — the file is immutable for the life of a
// deploy there, so re-reading it on every request would be pure waste. In
// dev, the server process runs for hours across many edits to this file;
// caching it would mean every template.html change needs a manual restart
// to ever be served.
async function loadHtml() {
  if (cachedHtml && process.env.NODE_ENV === 'production') return cachedHtml
  const filePath = path.join(process.cwd(), 'lib/kc/template.html')
  const html = await readFile(filePath, 'utf8')
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
