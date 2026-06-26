import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Public routes: Monday webhooks and Vercel Cron entrypoints only.
// They don't carry a Clerk session — they authenticate via their own
// secret/signature checks inside the route handlers.
// Everything else (the Kingdom page `/`, `/dashboard/*`, dashboard APIs) is
// gated: a signed-in portal session syncs here via the Clerk satellite, so
// users arriving from the portal aren't re-prompted.
const isPublicRoute = createRouteMatcher([
  '/api/webhook(.*)',
  '/api/cron(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000'
      const signInUrl = new URL(`${portalUrl}/sign-in`)
      signInUrl.searchParams.set('redirect_url', req.url)
      return NextResponse.redirect(signInUrl)
    }
  }
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
