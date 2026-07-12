import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { accProjectUrl, fetchAllAccProjects, getApsToken } from '@/lib/services/apsService'
import { getPartnerHubs } from '@/lib/services/apsHubs'

// Manually links an EPM project to an ACC project chosen from the dropdown.
// Marked accLinkSource:'manual' so the auto-detect sync never overwrites it.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null) as { accProjectId?: string } | null
  const accProjectId = body?.accProjectId?.trim()
  if (!accProjectId) {
    return NextResponse.json({ error: 'accProjectId is required' }, { status: 400 })
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ ok: true, mock: true, accProjectId })
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default
    await connectDB()

    const accUrl = accProjectUrl(accProjectId)

    // Flag whether the chosen project lives outside the EasyBIM account (client
    // hub). Best-effort — if the account list can't be fetched, leave it unset.
    let accExternalHub: boolean | undefined
    try {
      const accountProjects = await fetchAllAccProjects(await getApsToken())
      if (accountProjects.length) {
        accExternalHub = !accountProjects.some(p => p.id === accProjectId)
      }
    } catch {
      // ignore — flag stays undefined
    }

    // If it's external, check whether a configured partner hub (e.g. ANA) owns
    // it, so the project gets live API access instead of the Excel import.
    const hubFields: Record<string, unknown> = {}
    if (accExternalHub) {
      for (const hub of getPartnerHubs()) {
        try {
          const hubProjects = await fetchAllAccProjects(await getApsToken(hub), hub.accountId)
          if (hubProjects.some(p => p.id === accProjectId)) {
            hubFields['externalIds.accHubId']   = hub.accountId
            hubFields['externalIds.accHubName'] = hub.name
            break
          }
        } catch {
          // ignore — stamp stays unset for this hub
        }
      }
    } else if (accExternalHub === false) {
      hubFields['externalIds.accHubId']   = null
      hubFields['externalIds.accHubName'] = null
    }

    const doc = await Project.findByIdAndUpdate(
      id,
      {
        $set: {
          'externalIds.accProjectId':  accProjectId,
          'externalIds.accProjectUrl': accUrl,
          'externalIds.accLinkSource': 'manual',
          ...(accExternalHub !== undefined ? { 'externalIds.accExternalHub': accExternalHub } : {}),
          ...hubFields,
          'snapshot.accLastSyncedAt':  new Date(),
        },
      },
      { new: true }
    ).lean() as Record<string, unknown> | null

    if (!doc) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    return NextResponse.json({ ok: true, accProjectId, accProjectUrl: accUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/projects/[id]/acc-link]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
