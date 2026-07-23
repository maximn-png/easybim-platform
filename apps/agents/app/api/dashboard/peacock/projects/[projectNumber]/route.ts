import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { setProjectFlag } from '@/lib/agents/peacock/projects'

export const runtime = 'nodejs'

// PATCH /api/dashboard/peacock/projects/[projectNumber] — toggle a marketing flag.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectNumber: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectNumber } = await params

  const body = await req.json().catch(() => ({}))
  const patch: { publishedToLinkedIn?: boolean; inPortfolio?: boolean } = {}
  if (typeof body?.publishedToLinkedIn === 'boolean') patch.publishedToLinkedIn = body.publishedToLinkedIn
  if (typeof body?.inPortfolio === 'boolean') patch.inPortfolio = body.inPortfolio
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'publishedToLinkedIn or inPortfolio (boolean) required' }, { status: 400 })
  }

  const flags = await setProjectFlag(projectNumber, patch, userId)
  return NextResponse.json({ projectNumber, ...flags })
}
