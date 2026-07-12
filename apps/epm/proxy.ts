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

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const { userId, sessionClaims } = await auth()
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000'

  if (!userId) {
    const signInUrl = new URL(`${portalUrl}/sign-in`)
    signInUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(signInUrl)
  }

  // Signed in, but does this user have the EPM card grant?
  const access = await resolveAccess(userId, sessionClaims)
  if (!canAccessApp(access, 'epm')) {
    return NextResponse.redirect(new URL(`${portalUrl}/no-access?app=epm`))
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/(api|trpc)(.*)',
  ],
}
