// ANA number resolution.
//
// The number ANA uses for a project (e.g. "09" for אשקלון) lives in ACC as the
// project's `jobNumber` — NOT the EasyBIM project number. We read it live from
// the ANA hub's ACC account (2-legged Admin API, cached 5 min by
// fetchAllAccProjects) and map it by ACC project id. This is the single source
// of truth for the ANA number across the /ana list, detail, and reports pages;
// there is no manual entry.

import { getPartnerHubs } from '@/lib/services/apsHubs'
import { fetchAllAccProjects, getApsToken } from '@/lib/services/apsService'

/**
 * Map of `accProjectId → ACC jobNumber` for every ANA-hub project that has a
 * jobNumber set. Projects without one are simply absent from the map (callers
 * fall back to an empty string → the UI renders "—"). Never throws: an ACC
 * failure yields an empty map so the page still renders.
 */
export async function getAnaNumberMap(): Promise<Map<string, string>> {
  const anaHub = getPartnerHubs().find(h => h.key === 'ana')
  if (!anaHub) return new Map()
  try {
    const token = await getApsToken(anaHub)
    const list = await fetchAllAccProjects(token, anaHub.accountId)
    const map = new Map<string, string>()
    for (const p of list) {
      if (p.jobNumber) map.set(p.id, p.jobNumber)
    }
    return map
  } catch (err) {
    console.warn('[anaAcc] jobNumber map fetch failed:', err)
    return new Map()
  }
}
