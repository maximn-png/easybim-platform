import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchAssetPublicUrl } from '@/lib/services/mondayService'

// Redirects to a FRESH signed URL for a Monday asset (update attachment).
// Monday's public_url is signed and expires, and the project-updates feed is
// cached in Mongo — so stored URLs break over time. The client renders update
// images through this proxy (by asset id), which resolves a valid URL on demand.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assetId } = await params
  if (!/^\d+$/.test(assetId)) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 })
  }
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not set' }, { status: 503 })
  }

  try {
    const url = await fetchAssetPublicUrl(assetId)
    if (!url) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    // Short private cache — signed URLs stay valid for a while, no need to hit
    // Monday for every rerender of the same feed.
    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    console.error('[GET /api/monday-asset]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
