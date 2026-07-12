import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchAccIssues } from '@/lib/services/apsService'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'
import { getApsUserToken } from '@/lib/services/apsUserToken'

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

  // Partner hubs (e.g. ANA) are client accounts we can reach live — their
  // projects take the API path below instead of the Excel import.
  const partnerHub = ext.accExternalHub
    ? getPartnerHubByAccountId(ext.accHubId as string | undefined)
    : null

  const loadImport = async () => {
    const IssueImport = (await import('@/app/models/IssueImport')).default
    const imp = await IssueImport.findOne({ projectId: id })
      .select('issues')
      .lean() as { issues?: unknown[] } | null
    return imp?.issues ?? []
  }

  // ── External-hub projects (no partner integration): serve the manually-
  // imported Excel/CSV issues. No Autodesk login required — the client account
  // isn't reachable via the API.
  if (ext.accExternalHub && !partnerHub) {
    const issues = await loadImport()
    if (issues.length === 0) {
      return NextResponse.json({ issues: [], count: 0, needsImport: true })
    }
    return NextResponse.json({ issues, count: issues.length, imported: true })
  }

  // ── EasyBIM-hub + partner-hub projects: live ACC Issues API (3-legged user token). ──
  const accProjectId = ext.accProjectId as string | undefined
  if (!accProjectId) {
    return NextResponse.json({ issues: [], count: 0, noAccProject: true })
  }

  // Hub-specific 3-legged token: partner-hub projects need a token issued
  // through the partner's app (own cookie pair) — the EasyBIM app's token
  // cannot see their hub.
  const accessToken = await getApsUserToken(partnerHub)
  if (!accessToken) {
    return NextResponse.json({ needsApsAuth: true, hub: partnerHub?.key })
  }

  try {
    const issues = await fetchAccIssues(accProjectId, accessToken, partnerHub)
    return NextResponse.json({ issues, count: issues.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Partner-hub projects may have an older Excel import — better stale data
    // than an error (e.g. the user isn't a member of that ACC project yet).
    if (partnerHub && !msg.includes('401')) {
      const imported = await loadImport()
      if (imported.length > 0) {
        console.warn(`[GET /api/projects/[id]/issues] live fetch failed for ${partnerHub.name} project, serving import:`, msg)
        return NextResponse.json({ issues: imported, count: imported.length, imported: true })
      }
    }
    if (msg.includes('401')) {
      return NextResponse.json({ needsApsAuth: true, hub: partnerHub?.key })
    }
    console.error('[GET /api/projects/[id]/issues]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
