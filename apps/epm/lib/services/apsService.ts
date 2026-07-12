// Autodesk Platform Services (APS) helpers.
// Phase 2: URL parsing + token fetching.
// Phase 3: fetchAccIssues() for open issue counts.

import type { ApsHub } from './apsHubs'

const APS_AUTH_URL = 'https://developer.api.autodesk.com/authentication/v2/token'

// ── Token cache ────────────────────────────────────────────────────────────

// One cached 2-legged token per credential set: EasyBIM's own app (default)
// plus each configured partner hub (see apsHubs.ts).
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getApsToken(hub?: ApsHub | null): Promise<string> {
  const cacheKey = hub?.key ?? 'easybim'
  const cached = tokenCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt - 30_000) {
    return cached.token
  }

  const clientId     = hub?.clientId     ?? process.env.APS_CLIENT_ID
  const clientSecret = hub?.clientSecret ?? process.env.APS_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error('APS_CLIENT_ID / APS_CLIENT_SECRET not set')

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    scope:         'data:read account:read',
    client_id:     clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(APS_AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params,
  })

  if (!res.ok) throw new Error(`APS token fetch failed (${cacheKey}): ${res.status}`)

  const json = await res.json() as { access_token: string; expires_in: number }
  tokenCache.set(cacheKey, {
    token:     json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  })
  return json.access_token
}

// ── URL parsing ────────────────────────────────────────────────────────────

// Extracts ACC project GUID from a URL like:
// https://acc.autodesk.com/build/project/GUID/...
// https://acc.autodesk.com/docs/files/projects/GUID/...
export function parseAccProjectId(accUrl: string): string | null {
  if (!accUrl) return null
  const match = accUrl.match(/\/projects?\/([\w-]{8,})/)
  return match?.[1] ?? null
}

// ── Phase 3: User token refresh (3-legged) ───────────────────────────────

// Exchanges a refresh_token for a new access_token.
// Called by the issues route when the stored access_token has expired.
// hub: refresh tokens are bound to the app that issued them — pass the partner
// hub whose app ran the OAuth flow (omit for the default EasyBIM app).
export async function refreshApsUserToken(refreshToken: string, hub?: ApsHub | null): Promise<{
  accessToken: string
  expiresIn: number
  newRefreshToken?: string
}> {
  const clientId     = hub?.clientId     ?? process.env.APS_CLIENT_ID
  const clientSecret = hub?.clientSecret ?? process.env.APS_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error('APS credentials not set')

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(APS_AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error(`APS refresh failed: ${res.status}`)

  const data = await res.json() as {
    access_token:  string
    refresh_token?: string
    expires_in:    number
  }

  return {
    accessToken:      data.access_token,
    expiresIn:        data.expires_in,
    newRefreshToken:  data.refresh_token,
  }
}

// ── Phase 3: ACC Issues ───────────────────────────────────────────────────

export interface AccIssue {
  id: string
  displayId?: string   // ACC issue number shown to users (e.g. "398")
  url?: string         // deep link to this issue in ACC
  title: string
  status: string
  issueType: string
  discipline: string
  description: string
  assignedTo: string | null
  createdBy?: string | null   // resolved person name of the issue creator
  createdAt: string
  updatedAt: string | null
  closedAt: string | null
  dueDate?: string | null
  // Every ACC custom attribute on the issue (title → display value), e.g.
  // { Discipline: "MEP", Phase: "Phase 2" }. Powers the dynamic "stack by" list.
  attributes?: Record<string, string>
}

// A project team member, used as an email-recipient candidate.
export interface AccMember {
  id: string
  name: string
  email: string
  role: string
  companyName: string
}

// Fetches the ACC project's team members (name + email + role).
// Mirrors the project-users fetch used by buildAssigneeRoleMap, but keeps the
// contact fields instead of discarding them. Uses a 2-legged token.
export async function fetchAccProjectMembers(projectId: string, token: string): Promise<AccMember[]> {
  for (const pid of [`b.${projectId}`, projectId]) {
    const users = await accGet(`${ACC_ADMIN_BASE}/projects/${pid}/users?limit=200`, token, `members/${pid}`)
    if (users.length === 0) continue

    const members: AccMember[] = []
    for (const raw of users) {
      const u = raw as Record<string, unknown>
      const email = String(u.email ?? '')
      if (!email) continue // can't email someone without an address
      const roles = (u.roles as Array<Record<string, unknown>> | undefined) ?? []
      const role = roles.map(r => String(r.name ?? '')).filter(Boolean).join(', ')
      const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
      const name = (u.name as string) || fullName || email
      members.push({
        id: String(u.id ?? u.autodeskId ?? email),
        name,
        email,
        role,
        companyName: String(u.companyName ?? ''),
      })
    }
    // Sort: members with a role first, then alphabetically by name
    members.sort((a, b) =>
      (b.role ? 1 : 0) - (a.role ? 1 : 0) || a.name.localeCompare(b.name, 'he')
    )
    console.log(`[ACC][members] ${members.length} members with email`)
    return members
  }
  return []
}

// ── ACC API bases ─────────────────────────────────────────────────────────
// ACC projects use the construction API, NOT the legacy BIM360 container API.
const ACC_ISSUES_BASE  = 'https://developer.api.autodesk.com/construction/issues/v1/projects'
const ACC_ADMIN_BASE   = 'https://developer.api.autodesk.com/construction/admin/v1'

// ── ACC project listing & matching ──────────────────────────────────────────
// Used to connect an EPM project to its ACC/BIM360 project by matching the EPM
// projectNumber against the ACC project's jobNumber. Replaces the old Monday
// MA-003 ACC-URL dependency.

export interface AccProjectSummary {
  id:        string          // bare GUID (what the Issues API expects)
  name:      string
  jobNumber: string | null   // ACC "jobNumber" — matched against EPM projectNumber
  platform:  string          // 'acc' | 'bim360'
  status:    string
  hubName?:  string          // owning hub/account name (for cross-hub listing)
}

// ACC/BIM360 ids come prefixed with "b." from the Data Management API; the
// construction Issues/Admin APIs use the bare GUID.
function stripBPrefix(id: string): string {
  return id.startsWith('b.') ? id.slice(2) : id
}

// The ACC account GUID. 2-legged tokens cannot enumerate hubs, so this must be
// configured explicitly rather than discovered.
export function getApsAccountId(): string {
  const accountId = process.env.APS_ACCOUNT_ID
  if (!accountId) throw new Error('APS_ACCOUNT_ID not set')
  return accountId
}

// Builds a display URL that opens the project itself in ACC. The bare
// `/projects/{id}` route just lands on the account project LIST, so we deep-link
// into the project's Files (Docs) view — a module every project has, and the same
// `/docs/.../projects/{id}/...` shape the working Issues link uses. Still matches
// parseAccProjectId().
export function accProjectUrl(id: string): string {
  return `https://acc.autodesk.com/docs/files/projects/${id}`
}

// Resolve the ACC link to show for a project. External/client hubs keep their
// real stored link (we can't synthesize cross-account URLs); for our own hub we
// always build the deep link from the GUID so it opens the project — never a
// stale `/projects/{id}` value that lands on the account project list.
export function resolveAccUrl(ext: Record<string, unknown>): string | undefined {
  const stored = ext.accProjectUrl as string | undefined
  if (ext.accExternalHub) return stored
  const id = ext.accProjectId as string | undefined
  return id ? accProjectUrl(id) : stored
}

// ── ACC project list cache ───────────────────────────────────────────────────
const projectsCache = new Map<string, { list: AccProjectSummary[]; expiresAt: number }>()
const PROJECTS_TTL = 5 * 60_000 // 5 min — the list is large and rarely changes

// Lists all projects (ACC + BIM360) in an account (EasyBIM's by default; pass a
// partner hub's accountId with a token from its credentials for client hubs).
// Uses a 2-legged token with account:read. Requires the APS app to be provisioned
// as a custom integration on the ACC account, otherwise the Admin API returns 403.
export async function fetchAllAccProjects(token: string, accountIdOverride?: string): Promise<AccProjectSummary[]> {
  const accountId = accountIdOverride ?? getApsAccountId()
  const cached = projectsCache.get(accountId)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.list
  }
  const list: AccProjectSummary[] = []
  const PAGE = 200
  for (let offset = 0; offset < 20_000; offset += PAGE) {
    const res = await fetch(
      `${ACC_ADMIN_BASE}/accounts/${accountId}/projects?limit=${PAGE}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      // First page failing is a hard error (e.g. 403 = app not provisioned on the
      // ACC account); later pages failing → stop with what we have.
      if (offset === 0) throw new Error(`ACC Admin API ${res.status}: ${await res.text()}`)
      console.warn(`[ACC][projects] page @${offset} → ${res.status}, stopping pagination`)
      break
    }
    const json = await res.json() as Record<string, unknown>
    const items = (Array.isArray(json) ? json : (json.results ?? json.data ?? [])) as unknown[]
    for (const raw of items) {
      const p = raw as Record<string, unknown>
      const id = String(p.id ?? '')
      if (!id) continue
      list.push({
        id,
        name:      String(p.name ?? ''),
        jobNumber: p.jobNumber != null && String(p.jobNumber) !== '' ? String(p.jobNumber) : null,
        platform:  String(p.platform ?? ''),
        status:    String(p.status ?? ''),
      })
    }
    if (items.length < PAGE) break
  }

  projectsCache.set(accountId, { list, expiresAt: Date.now() + PROJECTS_TTL })
  console.log(`[ACC][projects] fetched ${list.length} projects for account ${accountId.slice(0, 8)}…`)
  return list
}

// Finds the ACC project matching an EPM project number. Primary: exact jobNumber
// match. Fallback: project name contains the number as a whole token.
export function matchAccProjectByNumber(
  projects: AccProjectSummary[],
  projectNumber: string,
): AccProjectSummary | null {
  const target = projectNumber.trim().toUpperCase()
  if (!target) return null

  // Ignore archived projects — they're usually stale "(OLD)" duplicates that
  // would shadow the real active project (or its external/MA-003 counterpart).
  const candidates = projects.filter(p => p.status !== 'archived')

  const byJob = candidates.find(p => (p.jobNumber ?? '').trim().toUpperCase() === target)
  if (byJob) return byJob

  // Fallback: number appears as a standalone token in the name (e.g. "22129 - ...")
  const tokenRe = new RegExp(`(^|[^0-9A-Za-z])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9A-Za-z]|$)`)
  const byName = candidates.find(p => tokenRe.test(p.name.toUpperCase()))
  return byName ?? null
}

// ── Cross-hub project listing (Data Management API, 3-legged) ────────────────
// Lists every project the *logged-in user* is a member of, across ALL hubs —
// including client hubs we don't administer (where the 2-legged Admin API can't
// reach). The DM API does not expose jobNumber, so for non-administered hubs
// matching falls back to the project name; EasyBIM-hub projects are enriched
// with their real jobNumber below (best-effort).

const DM_BASE = 'https://developer.api.autodesk.com/project/v1'

interface DmEntity { id: string; attributes?: { name?: string; extension?: { type?: string } } }

async function dmGet(url: string, userToken: string): Promise<{ data: DmEntity[]; next: string | null }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${userToken}` } })
  if (!res.ok) throw new Error(`DM API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { data?: DmEntity[]; links?: { next?: { href?: string } } }
  return { data: json.data ?? [], next: json.links?.next?.href ?? null }
}

// platform label from the DM extension type, e.g. "...autodesk.bim360:Project"
function platformFromExt(type?: string): string {
  if (!type) return ''
  if (type.includes('bim360')) return 'bim360'
  if (type.includes('autodesk.core') || type.includes('acc')) return 'acc'
  return ''
}

// Lists all projects across every hub the user can access. 3-legged token.
export async function fetchUserAccProjects(userToken: string): Promise<AccProjectSummary[]> {
  const { data: hubs } = await dmGet(`${DM_BASE}/hubs`, userToken)

  const perHub = await Promise.all(hubs.map(async hub => {
    const hubName = hub.attributes?.name ?? ''
    const list: AccProjectSummary[] = []
    let url: string | null = `${DM_BASE}/hubs/${hub.id}/projects?page[limit]=200`
    for (let guard = 0; url && guard < 50; guard++) {
      const { data, next }: { data: DmEntity[]; next: string | null } = await dmGet(url, userToken)
      for (const p of data) {
        list.push({
          id:        stripBPrefix(p.id),
          name:      p.attributes?.name ?? '',
          jobNumber: null,
          platform:  platformFromExt(p.attributes?.extension?.type),
          status:    '',
          hubName,
        })
      }
      url = next
    }
    return list
  }))

  const all = perHub.flat()

  // Enrich with jobNumber for projects in the provisioned EasyBIM account
  // (2-legged Admin API), so exact number-matching still works there.
  if (process.env.APS_ACCOUNT_ID) {
    try {
      const admin = await fetchAllAccProjects(await getApsToken())
      const jobById = new Map(admin.map(a => [a.id, a.jobNumber]))
      for (const p of all) {
        const jn = jobById.get(p.id)
        if (jn) p.jobNumber = jn
      }
    } catch {
      // best-effort — listing still works without enrichment
    }
  }

  console.log(`[ACC][userProjects] ${all.length} projects across ${hubs.length} hubs`)
  return all
}

// Generic GET: handles {results:[]}, plain array, or {data:[]} responses.
async function accGet(url: string, token: string, label: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const body = await res.text()
      console.warn(`[ACC][${label}] ${res.status}: ${body.slice(0, 200)}`)
      return []
    }
    const json = await res.json() as Record<string, unknown>
    const items = (
      Array.isArray(json) ? json
      : (json.results ?? json.data ?? json.companies ?? json.items ?? [])
    ) as unknown[]
    return items
  } catch (e) {
    console.warn(`[ACC][${label}] error:`, e)
    return []
  }
}

// assignee ID → role name (e.g. "Structural Engineer", "Architect").
// Issues are assigned to a company (numeric companyGroupId) or a user.
// Project users carry roles[].name plus their companyGroupId/companyId/autodeskId,
// so we build a single map keyed by every possible assignee identifier.
//   - assignedToType "company": assignedTo = companyGroupId
//   - assignedToType "user":    assignedTo = autodeskId / user id
// For a company we pick the most common role among that company's members.
async function buildAssigneeRoleMap(
  projectId: string,
  twoLeggedToken: string,
): Promise<{ roleMap: Map<string, string>; nameMap: Map<string, string> }> {
  const map = new Map<string, string>()
  const nameMap = new Map<string, string>() // user id → person name (for "Created By")

  // Role label from a user's project roles (may be empty for many users).
  const roleOf = (u: Record<string, unknown>): string | null => {
    const roles = (u.roles as Array<Record<string, unknown>> | undefined) ?? []
    const names = roles.map(r => String(r.name ?? '')).filter(Boolean)
    return names.length ? names.join(', ') : null
  }
  // Display name fallback — so a user WITHOUT a project role still resolves to a
  // person instead of "Unassigned" (the root cause of missing assignees).
  const nameOf = (u: Record<string, unknown>): string | null => {
    const name = String(u.name ?? '').trim()
    if (name) return name
    const full = [u.firstName, u.lastName].map(x => String(x ?? '').trim()).filter(Boolean).join(' ')
    if (full) return full
    const email = String(u.email ?? '').trim()
    return email || null
  }

  for (const pid of [`b.${projectId}`, projectId]) {
    // Fetch ALL project users (paginate — a 200-cap silently dropped assignees on
    // large projects, which also showed up as "Unassigned").
    const users: unknown[] = []
    for (let offset = 0; offset < 10_000; offset += 200) {
      const page = await accGet(
        `${ACC_ADMIN_BASE}/projects/${pid}/users?limit=200&offset=${offset}`,
        twoLeggedToken, `projectUsers/${pid}@${offset}`
      )
      users.push(...page)
      if (page.length < 200) break
    }
    if (users.length === 0) continue

    // Tally roles per company so we can pick the dominant one
    const companyRoleVotes = new Map<string, Map<string, number>>() // companyGroupId → role → count
    const companyIdToGroup = new Map<string, string>()              // companyId(UUID) → companyGroupId

    for (const raw of users) {
      const u = raw as Record<string, unknown>
      const role = roleOf(u)
      // Prefer the role (keeps role-based grouping); fall back to the name so the
      // assignee is never lost.
      const label = role ?? nameOf(u)

      // Direct user-assignee mappings — keyed by every id the Issues API may use.
      if (label) {
        if (u.autodeskId != null) map.set(String(u.autodeskId), label)
        if (u.id != null)         map.set(String(u.id), label)
      }

      // Person-name mapping (not role) — resolves an issue's createdBy to a name.
      const personName = nameOf(u)
      if (personName) {
        if (u.autodeskId != null) nameMap.set(String(u.autodeskId), personName)
        if (u.id != null)         nameMap.set(String(u.id), personName)
      }

      // Role-assignee mappings: issues assigned to a ROLE (assignedToType "role")
      // carry the role id, not a person — map both the role UUID and its numeric
      // group id to the role name so those issues resolve instead of "Unassigned".
      const userRoles = (u.roles as Array<Record<string, unknown>> | undefined) ?? []
      for (const r of userRoles) {
        const rname = String(r.name ?? '').trim()
        if (!rname) continue
        if (r.id != null)          map.set(String(r.id), rname)
        if (r.roleGroupId != null) map.set(String(r.roleGroupId), rname)
      }

      // Accumulate votes toward the user's company (role only — companies group by role)
      const groupId = u.companyGroupId != null ? String(u.companyGroupId) : null
      if (groupId) {
        if (u.companyId != null) companyIdToGroup.set(String(u.companyId), groupId)
        if (role) {
          const votes = companyRoleVotes.get(groupId) ?? new Map<string, number>()
          votes.set(role, (votes.get(role) ?? 0) + 1)
          companyRoleVotes.set(groupId, votes)
        }
      }
    }

    // Resolve each company to its most common role
    for (const [groupId, votes] of companyRoleVotes) {
      let best = ''
      let bestCount = -1
      for (const [role, count] of votes) {
        if (count > bestCount) { best = role; bestCount = count }
      }
      if (best) {
        map.set(groupId, best)
        for (const [uuid, g] of companyIdToGroup) {
          if (g === groupId) map.set(uuid, best)
        }
      }
    }

    break
  }

  console.log(`[ACC][assigneeRoles] role map=${map.size}, name map=${nameMap.size}`)
  return { roleMap: map, nameMap }
}

// issueTypeId / issueSubtypeId UUID → human-readable title
// ACC Issues API: GET .../issue-types?include=subtypes (uses 3-legged user token)
async function buildTypeMap(projectId: string, token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const items = await accGet(
    `${ACC_ISSUES_BASE}/${projectId}/issue-types?include=subtypes&limit=100`,
    token, 'issueTypes'
  )
  for (const raw of items) {
    const t = raw as Record<string, unknown>
    if (t.id && t.title) map.set(String(t.id), String(t.title))
    const subtypes = t.subtypes
    if (Array.isArray(subtypes)) {
      for (const sub of subtypes as Array<Record<string, unknown>>) {
        if (sub.id && sub.title) map.set(String(sub.id), String(sub.title))
      }
    }
  }
  console.log(`[ACC][issueTypes] map size=${map.size}`)
  return map
}

// custom attribute list-option UUID → display value (used for Discipline)
// ACC Issues API: GET .../issue-attribute-definitions (uses 3-legged user token)
async function buildAttribMap(projectId: string, token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const items = await accGet(
    `${ACC_ISSUES_BASE}/${projectId}/issue-attribute-definitions?limit=100`,
    token, 'customAttribs'
  )
  for (const raw of items) {
    const attr = raw as Record<string, unknown>
    // For list-type attributes, the options live under metadata.list.options
    const metaList = (attr.metadata as Record<string, unknown> | undefined)?.list as
      | Record<string, unknown>
      | undefined
    const candidate =
      metaList?.options ??
      (attr.metadata as Record<string, unknown> | undefined)?.list ??
      attr.allowedValues ?? attr.options ?? []
    const list = (Array.isArray(candidate) ? candidate : []) as Array<Record<string, unknown>>
    for (const opt of list) {
      const val = opt.value ?? opt.title ?? opt.label
      if (opt.id && val) map.set(String(opt.id), String(val))
    }
  }
  console.log(`[ACC][customAttribs] map size=${map.size}`)
  return map
}

// userToken: the 3-legged OAuth access token from the user's cookie.
// The ACC Issues API does NOT accept client-credential (2-legged) tokens.
// hub: pass the project's partner hub (client account) so the assignee-role
// lookup uses that account's 2-legged credentials; omit for EasyBIM projects.
export async function fetchAccIssues(projectId: string, userToken: string, hub?: ApsHub | null): Promise<AccIssue[]> {
  // ACC Issues API caps each page at 100 — paginate via offset to fetch ALL issues.
  const results: unknown[] = []
  const PAGE = 100
  for (let offset = 0; offset < 10_000; offset += PAGE) {
    const issuesRes = await fetch(
      `https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues?limit=${PAGE}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' } }
    )
    if (!issuesRes.ok) {
      // First page failing is a hard error; later pages failing → stop with what we have.
      if (offset === 0) throw new Error(`ACC Issues API ${issuesRes.status}: ${await issuesRes.text()}`)
      console.warn(`[ACC] issues page @${offset} → ${issuesRes.status}, stopping pagination`)
      break
    }
    const json = await issuesRes.json() as {
      results?: unknown[]
      pagination?: { totalResults?: number }
    }
    const page = json.results ?? []
    results.push(...page)
    const total = json.pagination?.totalResults
    if (page.length < PAGE || (total != null && results.length >= total)) break
  }

  if (results.length === 0) return []

  console.log(`[ACC] projectId=${projectId} fetched ${results.length} issues (all pages)`)

  // Assignee roles use a 2-legged token (ACC admin project-users API) — the
  // owning account's credentials (partner hub creds for client-hub projects).
  // Issue types & custom attributes are part of the Issues API → 3-legged user token.
  const twoLeggedToken = await getApsToken(hub)
  const [assigneeMaps, typeMap, attribMap] = await Promise.all([
    buildAssigneeRoleMap(projectId, twoLeggedToken),
    buildTypeMap(projectId, userToken),
    buildAttribMap(projectId, userToken),
  ])
  const { roleMap, nameMap } = assigneeMaps

  return results.map(raw => {
    const item = raw as Record<string, unknown>

    // assignedTo: company/user ID → role name (e.g. "Architect"). Falls back to null.
    const rawId = item.assignedTo != null ? String(item.assignedTo) : null
    const assignedTo = rawId ? (roleMap.get(rawId) ?? null) : null

    // createdBy: creator user id → person name (falls back to null / raw id).
    const createdBy = item.createdBy != null
      ? (nameMap.get(String(item.createdBy)) ?? null)
      : null

    // issueType: subtype (more specific) takes priority over type
    const issueType =
      typeMap.get(String(item.issueSubtypeId ?? '')) ??
      typeMap.get(String(item.issueTypeId ?? '')) ??
      'Other'

    // Capture ALL custom attributes (title → display value). List-type values are
    // option UUIDs resolved via attribMap; other types keep their raw value.
    // Discipline is just one of these — kept as its own field for the table/filters.
    const customAttribs = (item.customAttributes as Array<Record<string, unknown>>) ?? []
    const attributes: Record<string, string> = {}
    for (const a of customAttribs) {
      const title = String(a.title ?? '').trim()
      if (!title) continue
      const raw = a.value
      if (raw == null || String(raw) === '') continue
      const resolved = attribMap.get(String(raw)) ?? String(raw)
      if (resolved) attributes[title] = resolved
    }
    const disciplineKey = Object.keys(attributes).find(k => k.toLowerCase() === 'discipline')
    const discipline = disciplineKey ? attributes[disciplineKey] : ''

    const issueId = String(item.id ?? '')
    return {
      id: issueId,
      displayId: item.displayId != null ? String(item.displayId) : undefined,
      url: issueId ? `https://acc.autodesk.com/docs/issues/projects/${projectId}/issues?issueId=${issueId}` : undefined,
      title: String(item.title ?? ''),
      status: String(item.status ?? 'open'),
      issueType,
      discipline,
      description: String(item.description ?? ''),
      assignedTo,
      createdBy,
      createdAt: String(item.createdAt ?? new Date().toISOString()),
      updatedAt: item.updatedAt != null ? String(item.updatedAt) : null,
      closedAt: item.closedAt != null ? String(item.closedAt) : null,
      dueDate: item.dueDate != null && String(item.dueDate) !== '' ? String(item.dueDate) : null,
      attributes,
    }
  })
}
