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

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ issues: [], count: 0, mock: true })
  }

  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()

  const doc = await Project.findById(id).lean() as Record<string, unknown> | null
  if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const ext = (doc.externalIds ?? {}) as Record<string, unknown>

  // ── External-hub projects: serve the manually-imported Excel/CSV issues. ──
  // No Autodesk login required — the client account isn't reachable via the API.
  if (ext.accExternalHub) {
    const IssueImport = (await import('@/app/models/IssueImport')).default
    const imp = await IssueImport.findOne({ projectId: id })
      .select('issues')
      .lean() as { issues?: unknown[] } | null
    const issues = imp?.issues ?? []
    if (issues.length === 0) {
      return NextResponse.json({ issues: [], count: 0, needsImport: true })
    }
    return NextResponse.json({ issues, count: issues.length, imported: true })
  }

  // ── EasyBIM-hub projects: live ACC Issues API (3-legged user token). ──
  const accProjectId = ext.accProjectId as string | undefined
  if (!accProjectId) {
    return NextResponse.json({ issues: [], count: 0, noAccProject: true })
  }

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
    const issues = await fetchAccIssues(accProjectId, accessToken!)
    return NextResponse.json({ issues, count: issues.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('401')) {
      return NextResponse.json({ needsApsAuth: true })
    }
    console.error('[GET /api/projects/[id]/issues]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
