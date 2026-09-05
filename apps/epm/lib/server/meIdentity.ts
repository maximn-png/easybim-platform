// Who is the signed-in user, across systems? Clerk gives the display name and
// email; the email resolves to a Monday account (id + Monday's spelling of the
// name). Project snapshots store team members by mondayId, so id matching
// works even when Clerk and Monday disagree on the name ("Polina E" vs
// "Polina Eisenshtadt").

import { clerkClient } from '@clerk/nextjs/server'
import { normalizeName, samePerson } from '@/lib/people'

export interface MeIdentity {
  name: string            // Clerk display name ('' when Clerk lookup failed)
  email: string | null
  mondayId: string | null
  mondayName: string | null
}

export async function resolveMeIdentity(userId: string): Promise<MeIdentity> {
  let name = ''
  let email: string | null = null
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    name = [user.firstName, user.lastName].filter(Boolean).join(' ')
    email = user.primaryEmailAddress?.emailAddress ?? null
  } catch { /* identity stays partial; matching falls back to nothing */ }

  let mondayId: string | null = null
  let mondayName: string | null = null
  if (email && process.env.MONDAY_API_TOKEN) {
    try {
      const { fetchMondayUserByEmail } = await import('@/lib/services/mondayService')
      const mUser = await fetchMondayUserByEmail(email)
      if (mUser) {
        mondayId = mUser.id
        mondayName = mUser.name
      }
    } catch (err) {
      console.warn('[resolveMeIdentity] Monday lookup failed:', err)
    }
  }

  return { name, email, mondayId, mondayName }
}

// Does a project-snapshot team slot belong to this identity? Strongest signal
// first: the Monday user id, then email/Clerk-name, then Monday's spelling of
// the name.
export function slotIsMe(
  member: { name?: string | null; email?: string | null; mondayId?: string | null } | null | undefined,
  me: MeIdentity,
): boolean {
  if (!member) return false
  if (me.mondayId && member.mondayId && String(member.mondayId) === String(me.mondayId)) return true
  if (samePerson(member, { name: me.name, email: me.email })) return true
  if (me.mondayName && member.name) return normalizeName(member.name) === normalizeName(me.mondayName)
  return false
}
