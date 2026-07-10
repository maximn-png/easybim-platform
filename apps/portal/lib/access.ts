import { auth } from '@clerk/nextjs/server'
import { resolveAccess, isAdmin, type AccessMetadata } from '@easybim/auth'

/** Access metadata for the signed-in user, or null when signed out. */
export async function getAccess(): Promise<
  { userId: string; access: AccessMetadata } | null
> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null
  return { userId, access: await resolveAccess(userId, sessionClaims) }
}

/**
 * Guard for admin pages and /api/admin routes.
 * Returns the caller's userId, or null when not signed in or not an admin —
 * callers respond with 401/redirect.
 */
export async function requireAdmin(): Promise<string | null> {
  const result = await getAccess()
  if (!result || !isAdmin(result.access)) return null
  return result.userId
}
