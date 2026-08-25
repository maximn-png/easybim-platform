import { clerkClient } from '@clerk/nextjs/server'
import { resolveAccess, resolveKnowledgeRole } from '@easybim/auth'

// Real display name for a Clerk user — same fallback chain used by
// apps/epm's reports route (firstName+lastName, else email, else a generic
// label). Best-effort: a Clerk API hiccup must never block the write this
// name is attached to.
export async function hydrateName(userId: string): Promise<string> {
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    return (
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.primaryEmailAddress?.emailAddress ||
      'Someone'
    )
  } catch {
    return 'Someone'
  }
}

// Real, server-resolved role check — the only place that decides whether a
// request may approve/reject a suggestion. Never trust a client-sent role.
export async function isTeamLead(userId: string, sessionClaims: unknown): Promise<boolean> {
  const access = await resolveAccess(userId, sessionClaims)
  return resolveKnowledgeRole(access) === 'teamlead'
}

export interface KcIdentity {
  name: string
  mail: string
  initials: string
}

// Same initials algorithm as kc-app.js's own KC.initialsOf (first letter of
// the first two words, uppercased) — computed here so the identity kc-api.js
// paints in on boot already matches what the rest of the app would derive
// from the same name if it ever recomputed initials itself.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return letters.toUpperCase() || '?'
}

// The real signed-in person's identity, for kc-api.js to paint over
// kc-app.js's hardcoded DEFAULT_IDENTITY/"Gal Shem Tov" stub. Best-effort,
// same reasoning as hydrateName: never let a Clerk hiccup break the page.
export async function hydrateIdentity(userId: string): Promise<KcIdentity> {
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.primaryEmailAddress?.emailAddress ||
      'Someone'
    return { name, mail: user.primaryEmailAddress?.emailAddress ?? '', initials: initialsOf(name) }
  } catch {
    return { name: 'Someone', mail: '', initials: '?' }
  }
}
