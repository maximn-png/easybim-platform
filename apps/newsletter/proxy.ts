import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { canAccessApp, resolveAccess } from '@easybim/auth'

const isPublicRoute = createRouteMatcher([
  '/',
  '/api/webhook(.*)',
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

  // Signed in, but the user also needs the `newsletter` card grant.
  const access = await resolveAccess(userId, sessionClaims)
  if (!canAccessApp(access, 'newsletter')) {
    return NextResponse.redirect(new URL(`${portalUrl}/no-access?app=newsletter`))
  }
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
