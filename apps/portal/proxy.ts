import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { resolveAccess, isAdmin } from '@easybim/auth'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  // Clerk webhook — authenticated by its Svix signature, not a Clerk session.
  '/api/webhooks/clerk',
  // Integration probe — carries no data, used by the admin Integrations board.
  '/api/health',
])

// Admin Console (+ its APIs) — admin-only at the edge; pages/APIs re-check
// via requireAdmin()/guardAdmin() as defense in depth. Claims-based, so a
// revoked admin keeps access until session-token refresh (~60s), same as
// the satellite apps' app-grant gating.
const isAdminRoute = createRouteMatcher(['/admin(.*)', '/api/admin(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  await auth.protect()

  if (isAdminRoute(req)) {
    const { userId, sessionClaims } = await auth()
    const access = await resolveAccess(userId!, sessionClaims)
    if (!isAdmin(access)) {
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
