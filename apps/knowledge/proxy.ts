import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { canAccessApp, resolveAccess } from '@easybim/auth'

// Public routes: webhooks and Vercel Cron entrypoints only.
// They don't carry a Clerk session — they authenticate via their own
// secret/signature checks inside the route handlers.
// The /api/health diagnostics endpoint is public so a dev can verify the
// integration wiring before signing in.
// Everything else (the landing page `/`, feature pages, dashboard APIs) is
// gated: a signed-in portal session syncs here via the Clerk satellite, so
// users arriving from the portal aren't re-prompted. Beyond being signed in,
// the user must hold the `knowledge` card grant (Clerk publicMetadata.apps).
const isPublicRoute = createRouteMatcher([
  '/api/webhook(.*)',
  '/api/cron(.*)',
  '/api/health(.*)',
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
  if (!canAccessApp(access, 'knowledge')) {
    return NextResponse.redirect(new URL(`${portalUrl}/no-access?app=knowledge`))
  }
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
