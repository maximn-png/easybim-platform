import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getPartnerHubs } from '@/lib/services/apsHubs'
import { apsCookieNames } from '@/lib/services/apsUserToken'

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/dashboard'
  const hubKey = req.nextUrl.searchParams.get('hub')
  const hub = hubKey ? getPartnerHubs().find(h => h.key === hubKey) ?? null : null

  const jar = await cookies()
  const names = apsCookieNames(hub)
  jar.delete(names.access)
  jar.delete(names.refresh)

  // Redirect straight to the OAuth flow for the same app
  const base = req.nextUrl.origin
  const hubParam = hub ? `&hub=${hub.key}` : ''
  return NextResponse.redirect(`${base}/api/auth/autodesk?returnTo=${encodeURIComponent(returnTo)}${hubParam}`)
}
