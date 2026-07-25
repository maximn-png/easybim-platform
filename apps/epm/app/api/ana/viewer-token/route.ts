import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveEpmAccess } from '@/lib/server/anaAccess'
import { getPartnerHubs } from '@/lib/services/apsHubs'
import { getApsViewerToken } from '@/lib/services/apsViewer'

// GET /api/ana/viewer-token
// Short-lived 2-legged token (data:read viewables:read) for the browser
// Autodesk Viewer. Scoped to the ANA hub — the only partner hub whose models
// the ANA area surfaces. Read-only; usable by ANA clients and internal EPM users.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { hasEpm, hasAna } = await resolveEpmAccess()
  if (!hasEpm && !hasAna) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const anaHub = getPartnerHubs().find(h => h.key === 'ana')
  if (!anaHub) return NextResponse.json({ error: 'ANA hub not configured' }, { status: 503 })

  try {
    const { access_token, expires_in } = await getApsViewerToken(anaHub)
    return NextResponse.json({ access_token, expires_in })
  } catch (err) {
    console.error('[GET /api/ana/viewer-token]', err)
    return NextResponse.json({ error: 'Token fetch failed' }, { status: 502 })
  }
}
