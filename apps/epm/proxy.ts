import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// The cron sync endpoint self-guards with CRON_SECRET (see the route), so it must
// be public to Clerk middleware — otherwise the Vercel hourly cron (no session)
// gets redirected to sign-in and never runs.
const isPublicRoute = createRouteMatcher(['/api/sync/projects(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/(api|trpc)(.*)',
  ],
}
