import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const APS_TOKEN_URL = 'https://developer.api.autodesk.com/authentication/v2/token'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  // Validate state to prevent CSRF
  const jar = await cookies()
  const stored = jar.get('aps_oauth_state')?.value
  if (!stored) return NextResponse.json({ error: 'Missing OAuth state cookie' }, { status: 400 })

  let returnTo = '/dashboard'
  try {
    const parsed = JSON.parse(stored) as { state: string; returnTo: string }
    if (parsed.state !== state) {
      return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 })
    }
    returnTo = parsed.returnTo
  } catch {
    return NextResponse.json({ error: 'Corrupt OAuth state cookie' }, { status: 400 })
  }

  const clientId     = process.env.APS_CLIENT_ID
  const clientSecret = process.env.APS_CLIENT_SECRET
  const callbackUrl  = process.env.APS_CALLBACK_URL

  if (!clientId || !clientSecret || !callbackUrl) {
    return NextResponse.json({ error: 'APS credentials not configured' }, { status: 503 })
  }

  // Exchange code for tokens
  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: callbackUrl,
    client_id:    clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(APS_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `APS token exchange failed: ${res.status} ${text}` }, { status: 502 })
  }

  const data = await res.json() as {
    access_token:  string
    refresh_token?: string
    expires_in:    number
  }

  // Clear the state cookie and store tokens
  const secure = process.env.NODE_ENV === 'production'
  jar.delete('aps_oauth_state')

  jar.set('aps_access_token', data.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: data.expires_in - 60, // slightly under expiry
    path: '/',
  })

  if (data.refresh_token) {
    jar.set('aps_refresh_token', data.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
  }

  // Redirect back to the original page
  const base = req.nextUrl.origin
  return NextResponse.redirect(`${base}${returnTo}`)
}
