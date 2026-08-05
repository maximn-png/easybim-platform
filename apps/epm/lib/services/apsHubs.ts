// Partner-hub registry: client ACC accounts (e.g. ANA) whose admins provisioned
// a dedicated APS app as a Custom Integration, letting EPM reach their account
// server-side (2-legged Admin API). Issues themselves still come through the
// user's 3-legged token — the Issues API rejects service-to-service tokens —
// but hub membership detection and assignee-role resolution need these creds.
// EasyBIM's own account (APS_CLIENT_ID / APS_ACCOUNT_ID) is the implicit default.

export interface ApsHub {
  key: string          // stable id, e.g. 'ana'
  name: string         // display label, e.g. 'ANA'
  accountId: string    // ACC account GUID (hub id without the 'b.' prefix)
  clientId: string
  clientSecret: string
}

// A hub is only active when all three of its APS_<PREFIX>_* env vars are set.
const PARTNER_HUB_DEFS = [
  { key: 'ana', name: 'ANA', envPrefix: 'APS_ANA' },
] as const

export function getPartnerHubs(): ApsHub[] {
  const hubs: ApsHub[] = []
  for (const def of PARTNER_HUB_DEFS) {
    const clientId     = process.env[`${def.envPrefix}_CLIENT_ID`]
    const clientSecret = process.env[`${def.envPrefix}_CLIENT_SECRET`]
    const accountId    = process.env[`${def.envPrefix}_ACCOUNT_ID`]
    if (clientId && clientSecret && accountId) {
      hubs.push({ key: def.key, name: def.name, accountId, clientId, clientSecret })
    }
  }
  return hubs
}

// Resolve a project's partner hub from its stored externalIds.accHubId.
export function getPartnerHubByAccountId(accountId?: string | null): ApsHub | null {
  if (!accountId) return null
  return getPartnerHubs().find(h => h.accountId === accountId) ?? null
}

// EasyBIM's own ACC account, expressed as an ApsHub so the viewer code paths
// (token, discovery) work uniformly across our hub and partner hubs.
export function getEasybimHub(): ApsHub | null {
  const clientId     = process.env.APS_CLIENT_ID
  const clientSecret = process.env.APS_CLIENT_SECRET
  const accountId    = process.env.APS_ACCOUNT_ID
  if (!clientId || !clientSecret || !accountId) return null
  return { key: 'easybim', name: 'EasyBIM', accountId, clientId, clientSecret }
}

// Hub whose 2-legged credentials can drive the model viewer for a project:
// EasyBIM's own account or a configured partner hub (e.g. ANA). Projects
// flagged accExternalHub live OUTSIDE the EasyBIM account — for those, only a
// matching partner hub works; any other client hub → null → no viewer.
export function resolveViewerHub(accHubId?: string | null, accExternalHub?: boolean | null): ApsHub | null {
  const easybim = getEasybimHub()
  const partner = getPartnerHubByAccountId(accHubId)
  if (accExternalHub) return partner
  if (!accHubId) return easybim
  if (easybim && accHubId === easybim.accountId) return easybim
  return partner
}
