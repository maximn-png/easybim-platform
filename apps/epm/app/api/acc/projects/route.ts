import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchAllAccProjects, fetchUserAccProjects, getApsToken, type AccProjectSummary } from '@/lib/services/apsService'
import { getPartnerHubs } from '@/lib/services/apsHubs'

// Lists ACC/BIM360 projects for the "Select Forma Project" dropdown.
//
// ?hub=<key> (partner hub, e.g. ANA): that hub's full project list via its own
// 2-legged Admin API credentials — no user token needed.
//
// Otherwise: every project the logged-in user belongs to across their hubs
// (3-legged Data Management API), merged with all configured partner hubs'
// lists so partner projects are always linkable (the user's EasyBIM-app token
// can't see partner hubs — Autodesk scopes hub access per app).
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Partner-hub lists come from each hub's 2-legged Admin API (server creds).
  const fetchPartnerLists = async (): Promise<AccProjectSummary[]> => {
    const lists = await Promise.all(getPartnerHubs().map(async hub => {
      try {
        const list = await fetchAllAccProjects(await getApsToken(hub), hub.accountId)
        return list
          .filter(p => p.status !== 'archived')
          .map(p => ({ ...p, hubName: hub.name }))
      } catch (err) {
        console.warn(`[GET /api/acc/projects] ${hub.name} hub list failed:`, err)
        return []
      }
    }))
    return lists.flat()
  }

  const hubKey = req.nextUrl.searchParams.get('hub')
  if (hubKey) {
    const hub = getPartnerHubs().find(h => h.key === hubKey)
    if (!hub) {
      return NextResponse.json({ error: `Unknown or unconfigured hub: ${hubKey}` }, { status: 400 })
    }
    try {
      const list = await fetchAllAccProjects(await getApsToken(hub), hub.accountId)
      const projects = list
        .filter(p => p.status !== 'archived')
        .map(p => ({ ...p, hubName: hub.name }))
      return NextResponse.json({ projects })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[GET /api/acc/projects]', err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const { getApsUserToken } = await import('@/lib/services/apsUserToken')
  const accessToken = await getApsUserToken()
  if (!accessToken) {
    return NextResponse.json({ needsApsAuth: true })
  }

  try {
    const [userProjects, partnerProjects] = await Promise.all([
      fetchUserAccProjects(accessToken),
      fetchPartnerLists(),
    ])
    // Merge, preferring the partner-hub entry (it carries jobNumber + status,
    // which the cross-hub DM listing can't provide).
    const byId = new Map<string, AccProjectSummary>()
    for (const p of userProjects) byId.set(p.id, p)
    for (const p of partnerProjects) byId.set(p.id, p)
    return NextResponse.json({ projects: [...byId.values()] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('401')) {
      return NextResponse.json({ needsApsAuth: true })
    }
    console.error('[GET /api/acc/projects]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
