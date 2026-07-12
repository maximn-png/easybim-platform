// 3-legged APS user tokens, stored in httpOnly cookies — one pair per app.
// Autodesk gates hub access by the APP the token was issued through (Custom
// Integrations), so a token from the EasyBIM app can never see a partner hub
// like ANA: each partner hub runs its own OAuth flow and keeps its own cookies
// (aps_access_token_<hubKey>), while the EasyBIM app keeps the original names.

import { cookies } from 'next/headers'
import type { ApsHub } from './apsHubs'
import { refreshApsUserToken } from './apsService'

export function apsCookieNames(hub?: ApsHub | null): { access: string; refresh: string } {
  const suffix = hub ? `_${hub.key}` : ''
  return { access: `aps_access_token${suffix}`, refresh: `aps_refresh_token${suffix}` }
}

// Returns a valid 3-legged access token for the hub's app (EasyBIM by default),
// transparently refreshing and re-setting cookies when the access token expired.
// Null → no usable token; the caller should respond with needsApsAuth.
export async function getApsUserToken(hub?: ApsHub | null): Promise<string | null> {
  const jar = await cookies()
  const names = apsCookieNames(hub)

  const accessToken = jar.get(names.access)?.value
  if (accessToken) return accessToken

  const refreshToken = jar.get(names.refresh)?.value
  if (!refreshToken) return null

  try {
    const refreshed = await refreshApsUserToken(refreshToken, hub)
    const secure = process.env.NODE_ENV === 'production'
    jar.set(names.access, refreshed.accessToken, {
      httpOnly: true, secure, sameSite: 'lax',
      maxAge: refreshed.expiresIn - 60, path: '/',
    })
    if (refreshed.newRefreshToken) {
      jar.set(names.refresh, refreshed.newRefreshToken, {
        httpOnly: true, secure, sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, path: '/',
      })
    }
    return refreshed.accessToken
  } catch {
    return null
  }
}
