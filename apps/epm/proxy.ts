import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

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
