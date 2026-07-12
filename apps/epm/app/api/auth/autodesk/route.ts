import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { getPartnerHubs } from '@/lib/services/apsHubs'

const APS_AUTHORIZE_URL = 'https://developer.api.autodesk.com/authentication/v2/authorize'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ?hub=<key> runs the flow through a partner hub's app (e.g. ANA) — Autodesk
  // scopes hub access to the app the token was issued through, so partner-hub
  // projects need a token from the partner's own provisioned app.
  const hubKey = req.nextUrl.searchParams.get('hub')
  const hub = hubKey ? getPartnerHubs().find(h => h.key === hubKey) ?? null : null
  if (hubKey && !hub) {
    return NextResponse.json({ error: `Unknown or unconfigured hub: ${hubKey}` }, { status: 400 })
  }

  const clientId = hub?.clientId ?? process.env.APS_CLIENT_ID
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

  // Store state + returnTo + hub in a short-lived cookie
  const jar = await cookies()
  jar.set('aps_oauth_state', JSON.stringify({ state, returnTo, hub: hub?.key }), {
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
