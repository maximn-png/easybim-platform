import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'

// The portal's My Space header panel reads /api/me/* cross-origin (same site,
// different port/subdomain). These are simple GETs — no preflight — so the
// response only needs to allow the portal origin for the browser to hand the
// body to the portal page.
export function withMeCors<T extends NextResponse>(req: NextRequest, res: T): T {
  const origin = req.headers.get('origin')
  const allowed = new Set(
    [process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000'].map((u) => u.replace(/\/$/, ''))
  )
  if (origin && allowed.has(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Credentials', 'true')
    res.headers.set('Vary', 'Origin')
  }
  return res
}
