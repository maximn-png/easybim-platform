import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { randomBytes } from 'crypto'
import { authorizeUrl, isConfigured } from '@/lib/integrations/linkedin/client'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/linkedin/connect — start the OAuth dance.
// Returns a clear 501 (rather than a broken redirect) while the LinkedIn app
// hasn't been created yet, so the dashboard can explain what's missing.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isConfigured()) {
    return NextResponse.json(
      {
        error: 'LinkedIn app not configured',
        detail:
          'Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET, and add the callback URL to the app. See "Connecting LinkedIn" in apps/agents/README.md.',
      },
      { status: 501 }
    )
  }

  // CSRF: random state echoed back by LinkedIn, checked in the callback.
  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(authorizeUrl(state))
  res.cookies.set('li_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
