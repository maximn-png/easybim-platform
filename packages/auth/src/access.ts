// Per-user app access control, stored in Clerk `publicMetadata`:
//
//   { "admin": true, "apps": ["newsletter", "epm", "agents"], "knowledgeRole": "employee" }
//
// - `admin`: full access to every app + the portal's User Management page.
// - `apps`: list of app grant keys this user may open. Deny by default —
//   a user with no metadata sees no cards and is blocked by every app's proxy.
// - `knowledgeRole`: this person's real, server-assigned role inside the
//   Knowledge Center specifically (see resolveKnowledgeRole below) — set by
//   a portal admin via the User Management screen, never by the user
//   themselves. Absent means 'intern' (the lowest-privilege default).
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
export type AppId = 'newsletter' | 'epm' | 'agents' | 'knowledge' | 'finance' | (string & {})

export type KnowledgeRole = 'intern' | 'employee' | 'teamlead'
const KNOWLEDGE_ROLES: KnowledgeRole[] = ['intern', 'employee', 'teamlead']

export interface AccessMetadata {
  admin?: boolean
  apps?: string[]
  knowledgeRole?: KnowledgeRole
}

function parseKnowledgeRole(value: unknown): KnowledgeRole | undefined {
  return KNOWLEDGE_ROLES.includes(value as KnowledgeRole) ? (value as KnowledgeRole) : undefined
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
  const { admin, apps, knowledgeRole } = metadata as AccessMetadata
  return {
    admin: admin === true,
    apps: Array.isArray(apps) ? apps.filter((a): a is string => typeof a === 'string') : [],
    knowledgeRole: parseKnowledgeRole(knowledgeRole),
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
      knowledgeRole: parseKnowledgeRole(user.publicMetadata?.knowledgeRole),
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

/**
 * A platform admin always gets the top Knowledge Center role (consistent
 * with admin already bypassing every other app's grant check); everyone
 * else gets their assigned `knowledgeRole`, defaulting to the
 * lowest-privilege 'intern' when unset — deny-by-default, same spirit as
 * `apps` above. There is no client-controllable override: this is the one
 * and only source of truth for "which role is this real person."
 */
export function resolveKnowledgeRole(access: AccessMetadata): KnowledgeRole {
  if (isAdmin(access)) return 'teamlead'
  // Re-validated here too (not just at the metadata boundary) so any
  // caller passing through raw, not-yet-validated data can't smuggle an
  // arbitrary string into "the role" — this is a security check, not a
  // display convenience.
  return parseKnowledgeRole(access.knowledgeRole) ?? 'intern'
}
