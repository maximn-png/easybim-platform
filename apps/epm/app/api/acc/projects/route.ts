import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { fetchUserAccProjects, refreshApsUserToken } from '@/lib/services/apsService'

// Lists every ACC/BIM360 project the logged-in user belongs to, across ALL hubs
// (EasyBIM + client hubs we don't administer), for the "Select Forma Project"
// dropdown. Uses the user's 3-legged token (Data Management API) — same auth as
// the reports/issues route.
export async function GET(_req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jar = await cookies()
  let accessToken = jar.get('aps_access_token')?.value
  const refreshToken = jar.get('aps_refresh_token')?.value

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ needsApsAuth: true })
  }

  if (!accessToken && refreshToken) {
    try {
      const refreshed = await refreshApsUserToken(refreshToken)
      accessToken = refreshed.accessToken
      const secure = process.env.NODE_ENV === 'production'
      jar.set('aps_access_token', refreshed.accessToken, {
        httpOnly: true, secure, sameSite: 'lax',
        maxAge: refreshed.expiresIn - 60, path: '/',
      })
      if (refreshed.newRefreshToken) {
        jar.set('aps_refresh_token', refreshed.newRefreshToken, {
          httpOnly: true, secure, sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, path: '/',
        })
      }
    } catch {
      return NextResponse.json({ needsApsAuth: true })
    }
  }

  try {
    const projects = await fetchUserAccProjects(accessToken!)
    return NextResponse.json({ projects })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('401')) {
      return NextResponse.json({ needsApsAuth: true })
    }
    console.error('[GET /api/acc/projects]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
