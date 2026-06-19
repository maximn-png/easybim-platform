import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { fetchAccIssues, refreshApsUserToken } from '@/lib/services/apsService'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const jar = await cookies()

  // Read 3-legged user token from cookie
  let accessToken = jar.get('aps_access_token')?.value
  const refreshToken = jar.get('aps_refresh_token')?.value

  // If no token at all, tell the client to trigger the OAuth flow
  if (!accessToken && !refreshToken) {
    return NextResponse.json({ needsApsAuth: true })
  }

  // If access token expired but refresh token exists, try to refresh
  if (!accessToken && refreshToken) {
    try {
      const refreshed = await refreshApsUserToken(refreshToken)
      accessToken = refreshed.accessToken

      // Update cookies with new tokens
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
      // Refresh failed — tokens are invalid, need re-auth
      return NextResponse.json({ needsApsAuth: true })
    }
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ issues: [], count: 0, mock: true })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const doc = await Project.findById(id).lean() as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const ext = (doc.externalIds ?? {}) as Record<string, unknown>
    const accProjectId = ext.accProjectId as string | undefined

    if (!accProjectId) {
      return NextResponse.json({ issues: [], count: 0, noAccProject: true })
    }

    const issues = await fetchAccIssues(accProjectId, accessToken!)

    return NextResponse.json({ issues, count: issues.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    // If the user token was rejected (expired mid-session), prompt re-auth
    if (msg.includes('401')) {
      return NextResponse.json({ needsApsAuth: true })
    }

    console.error('[GET /api/projects/[id]/issues]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
