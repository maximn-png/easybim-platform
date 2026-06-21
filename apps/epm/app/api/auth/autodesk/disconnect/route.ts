import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/dashboard'
  const jar = await cookies()
  jar.delete('aps_access_token')
  jar.delete('aps_refresh_token')
  // Redirect straight to the OAuth flow with the new scope
  const base = req.nextUrl.origin
  return NextResponse.redirect(`${base}/api/auth/autodesk?returnTo=${encodeURIComponent(returnTo)}`)
}
