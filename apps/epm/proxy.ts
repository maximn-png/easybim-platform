import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { canAccessApp, resolveAccess } from '@easybim/auth'

// Public to Clerk middleware:
//  - the cron sync endpoint self-guards with CRON_SECRET (otherwise the Vercel
//    hourly cron, which has no session, gets redirected to sign-in)
//  - report images are loaded by external email recipients / Gmail's image proxy,
//    so they must not require a session (guarded by an unguessable reportId)
const isPublicRoute = createRouteMatcher([
  '/api/sync/projects(.*)',
  '/api/report-image/(.*)',
])

// Paths an ANA-only client (the `ana` grant without `epm`) may reach. Everything
// else is off-limits: pages redirect to /ana, API calls get a 403. The per-
// project "is this really an ANA project?" check happens in the Node handlers
// (see lib/server/anaAccess.ts) — middleware runs on the edge and can't hit Mongo.
const isAnaAllowedRoute = createRouteMatcher([
  '/ana(.*)',
  '/api/ana(.*)',
  '/api/auth/autodesk(.*)',        // connect Autodesk for live issues
  '/api/acc/projects(.*)',         // Forms & Actions project list (hub-scoped)
  '/api/projects/:id/issues(.*)',  // report + issue-% data (guarded, GET-only)
  '/api/projects/:id/reports(.*)', // saved-report list + view (guarded, GET-only)
])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const { userId, sessionClaims } = await auth()
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000'

  if (!userId) {
    const signInUrl = new URL(`${portalUrl}/sign-in`)
    signInUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(signInUrl)
  }

  const access = await resolveAccess(userId, sessionClaims)
  const hasEpm = canAccessApp(access, 'epm')
  const hasAna = canAccessApp(access, 'ana')

  // Full EasyBIM users (and admins) get the whole app.
  if (hasEpm) return

  // External ANA client: confined to the /ana area + the routes it needs.
  if (hasAna) {
    if (isAnaAllowedRoute(req)) return
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/ana', req.url))
  }

  // Neither grant → no access.
  return NextResponse.redirect(new URL(`${portalUrl}/no-access?app=epm`))
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/(api|trpc)(.*)',
  ],
}
