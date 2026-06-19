import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'

const APS_AUTHORIZE_URL = 'https://developer.api.autodesk.com/authentication/v2/authorize'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = process.env.APS_CLIENT_ID
  const callbackUrl = process.env.APS_CALLBACK_URL

  if (!clientId || !callbackUrl) {
    return NextResponse.json({ error: 'APS_CLIENT_ID or APS_CALLBACK_URL not configured' }, { status: 503 })
  }

  // returnTo: the page to redirect back to after auth (default: dashboard)
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/dashboard'

  // Generate a random state using Web Crypto API (works in both Node.js and Edge)
  const state = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Store state + returnTo in a short-lived cookie
  const jar = await cookies()
  jar.set('aps_oauth_state', JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
    path: '/',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'data:read account:read',
    state,
  })

  return NextResponse.redirect(`${APS_AUTHORIZE_URL}?${params}`)
}
