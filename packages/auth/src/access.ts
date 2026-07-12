// Per-user app access control, stored in Clerk `publicMetadata`:
//
//   { "admin": true, "apps": ["newsletter", "epm", "agents"] }
//
// - `admin`: full access to every app + the portal's User Management page.
// - `apps`: list of app grant keys this user may open. Deny by default —
//   a user with no metadata sees no cards and is blocked by every app's proxy.
//
// The metadata travels inside the session token via a Clerk custom session
// claim (Dashboard → Sessions → Customize session token):
//
//   { "metadata": "{{user.public_metadata}}" }
//
// so proxies can authorize without a Clerk API call. `resolveAccess` falls
// back to the Backend API only while that claim is not yet configured.

import { clerkClient } from '@clerk/nextjs/server'

/** Grant keys for the platform's apps. Must match portal card ids. */
export type AppId = 'newsletter' | 'epm' | 'agents' | 'knowledge' | (string & {})

export interface AccessMetadata {
  admin?: boolean
  apps?: string[]
}

/**
 * Extract access metadata from session claims.
 * Returns `undefined` when the custom session claim is not configured,
 * so callers can distinguish "no grants" from "claim missing".
 */
export function accessFromClaims(sessionClaims: unknown): AccessMetadata | undefined {
  const claims = sessionClaims as { metadata?: unknown } | null | undefined
  const metadata = claims?.metadata
  if (metadata === undefined || metadata === null) return undefined
  const { admin, apps } = metadata as AccessMetadata
  return {
    admin: admin === true,
    apps: Array.isArray(apps) ? apps.filter((a): a is string => typeof a === 'string') : [],
  }
}

/**
 * Resolve a user's access: session claim first, Clerk Backend API fallback.
 * The fallback only fires while the `metadata` session claim is not yet
 * configured in the Clerk dashboard; once it is, this never makes an API call.
 */
export async function resolveAccess(
  userId: string,
  sessionClaims: unknown
): Promise<AccessMetadata> {
  const fromClaims = accessFromClaims(sessionClaims)
  if (fromClaims !== undefined) return fromClaims
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    return {
      admin: user.publicMetadata?.admin === true,
      apps: Array.isArray(user.publicMetadata?.apps)
        ? (user.publicMetadata.apps as unknown[]).filter((a): a is string => typeof a === 'string')
        : [],
    }
  } catch {
    // Fail closed: an unreachable Clerk API must not grant access.
    return { admin: false, apps: [] }
  }
}

export function isAdmin(access: AccessMetadata): boolean {
  return access.admin === true
}

/** Admins can open every app; everyone else needs an explicit grant. */
export function canAccessApp(access: AccessMetadata, appId: AppId): boolean {
  return access.admin === true || (access.apps ?? []).includes(appId)
}
