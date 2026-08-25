import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { exchangeCode, listAdminOrganizations, saveConnection } from '@/lib/integrations/linkedin/client'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/dashboard/peacock/linkedin/callback?code=&state=
// Exchanges the code, finds the page Maxim administers, stores the encrypted
// tokens, then drops him back on the dashboard with a status in the query string.
function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL('/dashboard/peacock', req.nextUrl.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url)
  res.cookies.delete('li_oauth_state')
  return res
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const error = sp.get('error')
  if (error) {
    return back(req, { linkedin: 'error', reason: sp.get('error_description') ?? error })
  }

  const code = sp.get('code')
  const state = sp.get('state')
  const expected = req.cookies.get('li_oauth_state')?.value
  if (!code) return back(req, { linkedin: 'error', reason: 'No authorization code returned' })
  if (!state || !expected || state !== expected) {
    return back(req, { linkedin: 'error', reason: 'State mismatch — please try connecting again' })
  }

  try {
    const token = await exchangeCode(code)

    // The token alone doesn't say which page to report on; ask which orgs this
    // user administers. One → connect it. Several → connect the first and name it
    // in the redirect, so a wrong pick is at least visible.
    let orgs: { urn: string; name: string }[] = []
    try {
      orgs = await listAdminOrganizations()
    } catch (err) {
      return back(req, {
        linkedin: 'error',
        reason: `Signed in, but reading your admin pages failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }. The app likely lacks the Community Management API product.`,
      })
    }

    if (orgs.length === 0) {
      return back(req, {
        linkedin: 'error',
        reason: 'This LinkedIn account does not administer any company page.',
      })
    }

    await saveConnection({
      token,
      organizationUrn: orgs[0].urn,
      organizationName: orgs[0].name,
      connectedBy: userId,
    })
    return back(req, { linkedin: 'connected', org: orgs[0].name })
  } catch (err) {
    return back(req, { linkedin: 'error', reason: err instanceof Error ? err.message : 'connect failed' })
  }
}
