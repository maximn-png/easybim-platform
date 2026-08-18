// LinkedIn Community Management API client (organization page analytics).
//
// ⚠️ UNVERIFIED AGAINST THE LIVE API. Written from the documented contract but
// never executed — EasyBIM has no LinkedIn developer app yet, so there were no
// credentials to test with. The request shapes below (endpoints, params, headers)
// are the documented ones; response field names are the part most likely to need
// a tweak on first real call. Everything is funnelled through `rest()` and the
// small mapper functions so a correction is one place each. See the README's
// "Connecting LinkedIn" section for the setup steps that unblock this.
//
// Access requires LinkedIn's **Community Management API** product on the app,
// which is an application + review by LinkedIn — not self-serve. Until then the
// dashboard runs on the analytics import + per-post entry instead.
import { connectDB } from '@/lib/db/mongoose'
import LinkedInAccount, { ILinkedInAccount } from '@/lib/models/LinkedInAccount'
import { decrypt, encrypt } from '@/lib/utils/encryption'

const OAUTH_BASE = 'https://www.linkedin.com/oauth/v2'
const API_BASE = 'https://api.linkedin.com/rest'
/** LinkedIn-Version header: YYYYMM of the API version to pin. */
const API_VERSION = '202505'

/** Scopes needed to read org page + post analytics. */
export const SCOPES = ['r_organization_social', 'rw_organization_admin']

export class LinkedInNotConnectedError extends Error {
  constructor(message = 'LinkedIn is not connected') {
    super(message)
    this.name = 'LinkedInNotConnectedError'
  }
}

export function isConfigured(): boolean {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
}

function creds() {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new LinkedInNotConnectedError('LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not configured')
  }
  return { clientId, clientSecret }
}

/** Callback URL — must match the app's registered redirect exactly. */
export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_AGENTS_URL || 'http://localhost:3003'
  return `${base.replace(/\/$/, '')}/api/dashboard/peacock/linkedin/callback`
}

export function authorizeUrl(state: string): string {
  const { clientId } = creds()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri(),
    state,
    scope: SCOPES.join(' '),
  })
  return `${OAUTH_BASE}/authorization?${params}`
}

interface TokenResponse {
  access_token: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.access_token) {
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${JSON.stringify(json)}`)
  }
  return json as TokenResponse
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = creds()
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
  })
}

/** Persist the connection. Tokens are encrypted at rest. */
export async function saveConnection(args: {
  token: TokenResponse
  organizationUrn: string
  organizationName?: string
  connectedBy?: string
}): Promise<void> {
  await connectDB()
  const expiresAt = args.token.expires_in
    ? new Date(Date.now() + args.token.expires_in * 1000)
    : undefined
  await LinkedInAccount.findOneAndUpdate(
    { key: 'peacock' },
    {
      $set: {
        organizationUrn: args.organizationUrn,
        organizationName: args.organizationName,
        accessTokenEnc: encrypt(args.token.access_token),
        refreshTokenEnc: args.token.refresh_token ? encrypt(args.token.refresh_token) : undefined,
        expiresAt,
        scope: args.token.scope ?? SCOPES.join(' '),
        connectedBy: args.connectedBy,
        lastSyncError: undefined,
      },
    },
    { upsert: true, new: true }
  )
}

export async function getAccount(): Promise<ILinkedInAccount | null> {
  await connectDB()
  return LinkedInAccount.findOne({ key: 'peacock' })
}

export async function disconnect(): Promise<void> {
  await connectDB()
  await LinkedInAccount.deleteOne({ key: 'peacock' })
}

/**
 * A usable access token, refreshing it first when it is expired or close to it.
 * LinkedIn only issues refresh tokens to apps enabled for them; without one an
 * expired token means reconnecting by hand (surfaced as NotConnected).
 */
async function accessToken(): Promise<{ token: string; account: ILinkedInAccount }> {
  const account = await getAccount()
  if (!account) throw new LinkedInNotConnectedError()

  const expiringSoon = account.expiresAt && account.expiresAt.getTime() - Date.now() < 5 * 60_000
  if (expiringSoon) {
    const refresh = account.refreshTokenEnc ? decrypt(account.refreshTokenEnc) : ''
    if (!refresh) {
      throw new LinkedInNotConnectedError('LinkedIn token expired — reconnect the page')
    }
    const { clientId, clientSecret } = creds()
    const token = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
      client_secret: clientSecret,
    })
    account.accessTokenEnc = encrypt(token.access_token)
    if (token.refresh_token) account.refreshTokenEnc = encrypt(token.refresh_token)
    account.expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined
    await account.save()
    return { token: token.access_token, account }
  }

  const token = decrypt(account.accessTokenEnc)
  if (!token) throw new LinkedInNotConnectedError('Stored LinkedIn token could not be decrypted')
  return { token, account }
}

async function rest<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { token } = await accessToken()
  const url = `${API_BASE}/${path}${params ? `?${new URLSearchParams(params)}` : ''}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'LinkedIn-Version': API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`LinkedIn API ${res.status} on ${path}: ${text.slice(0, 400)}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

// ---------------------------------------------------------------------------
// organizations
// ---------------------------------------------------------------------------

export interface AdminOrg {
  urn: string
  name: string
}

/** Pages this user administers — used right after OAuth to pick the org. */
export async function listAdminOrganizations(): Promise<AdminOrg[]> {
  const data = await rest<{
    elements?: {
      organization?: string
      'organization~'?: { localizedName?: string; name?: { localized?: Record<string, string> } }
    }[]
  }>('organizationAcls', {
    q: 'roleAssignee',
    role: 'ADMINISTRATOR',
    state: 'APPROVED',
    projection: '(elements*(organization~(localizedName)))',
  })

  return (data.elements ?? [])
    .map((e) => {
      const urn = e.organization ?? ''
      const expanded = e['organization~']
      const name =
        expanded?.localizedName ??
        Object.values(expanded?.name?.localized ?? {})[0] ??
        urn
      return { urn, name }
    })
    .filter((o) => o.urn)
}

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------

export interface DailyStat {
  date: Date
  impressions: number
  uniqueImpressions: number
  engagements: number
  clicks: number
}

interface ShareStatsElement {
  totalShareStatistics?: {
    impressionCount?: number
    uniqueImpressionsCount?: number
    clickCount?: number
    likeCount?: number
    commentCount?: number
    shareCount?: number
    engagement?: number
  }
  timeRange?: { start?: number; end?: number }
  share?: string
  ugcPost?: string
}

function totalsOf(el: ShareStatsElement) {
  const s = el.totalShareStatistics ?? {}
  const engagements =
    (s.likeCount ?? 0) + (s.commentCount ?? 0) + (s.shareCount ?? 0) + (s.clickCount ?? 0)
  return {
    impressions: s.impressionCount ?? 0,
    uniqueImpressions: s.uniqueImpressionsCount ?? 0,
    clicks: s.clickCount ?? 0,
    reactions: s.likeCount ?? 0,
    comments: s.commentCount ?? 0,
    reposts: s.shareCount ?? 0,
    engagements,
  }
}

/** Day-by-day page share statistics over a window. */
export async function dailyShareStats(from: Date, to: Date): Promise<DailyStat[]> {
  const { account } = await accessToken()
  const data = await rest<{ elements?: ShareStatsElement[] }>('organizationalEntityShareStatistics', {
    q: 'organizationalEntity',
    organizationalEntity: account.organizationUrn,
    timeIntervals: `(timeRange:(start:${from.getTime()},end:${to.getTime()}),timeGranularityType:DAY)`,
  })

  return (data.elements ?? [])
    .filter((el) => el.timeRange?.start)
    .map((el) => {
      const t = totalsOf(el)
      return {
        date: new Date(el.timeRange!.start!),
        impressions: t.impressions,
        uniqueImpressions: t.uniqueImpressions,
        engagements: t.engagements,
        clicks: t.clicks,
      }
    })
}

export interface ShareMetrics {
  impressions: number
  reactions: number
  comments: number
  reposts: number
  clicks: number
}

/** Lifetime stats for one post, addressed by its activity/ugcPost URN. */
export async function shareStats(shareUrn: string): Promise<ShareMetrics | null> {
  const { account } = await accessToken()
  const key = shareUrn.includes(':ugcPost:') ? 'ugcPosts[0]' : 'shares[0]'
  const data = await rest<{ elements?: ShareStatsElement[] }>('organizationalEntityShareStatistics', {
    q: 'organizationalEntity',
    organizationalEntity: account.organizationUrn,
    [key]: shareUrn,
  })
  const el = data.elements?.[0]
  if (!el) return null
  const t = totalsOf(el)
  return {
    impressions: t.impressions,
    reactions: t.reactions,
    comments: t.comments,
    reposts: t.reposts,
    clicks: t.clicks,
  }
}

/** Current follower count for the page. */
export async function followerCount(): Promise<number | null> {
  const { account } = await accessToken()
  const id = account.organizationUrn.split(':').pop()
  if (!id) return null
  const data = await rest<{ firstDegreeSize?: number }>(
    `networkSizes/${encodeURIComponent(account.organizationUrn)}`,
    { edgeType: 'CompanyFollowedByMember' }
  )
  return data.firstDegreeSize ?? null
}

// ---------------------------------------------------------------------------
// post URL → URN
// ---------------------------------------------------------------------------

/**
 * Pull the share URN out of a pasted LinkedIn post URL. Handles the two shapes
 * Maxim actually copies from the browser:
 *   .../feed/update/urn:li:activity:7123456789/
 *   .../posts/easybim_slug-activity-7123456789-AbCd
 * Also accepts a bare URN.
 */
export function shareUrnFromUrl(url: string): string | null {
  if (!url) return null
  const direct = /urn:li:(activity|share|ugcPost):(\d+)/.exec(url)
  if (direct) return `urn:li:${direct[1]}:${direct[2]}`
  const slug = /-(activity|share|ugcPost)-(\d{6,})/i.exec(url)
  if (slug) return `urn:li:${slug[1].toLowerCase() === 'activity' ? 'activity' : slug[1]}:${slug[2]}`
  const trailing = /(?:^|\/)(\d{15,})(?:\/|$)/.exec(url)
  if (trailing) return `urn:li:activity:${trailing[1]}`
  return null
}
