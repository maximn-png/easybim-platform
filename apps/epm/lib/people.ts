// Person-identity matching between Clerk users, Monday team members and ACC
// issue creators. There is no identity table yet, so matching is by email when
// present and by normalized display name otherwise.

// Monday and ACC spell names slightly differently ("Gal Shem-Tov" vs "Gal Shem Tov"),
// so the comparison ignores case, hyphens/underscores, dots and extra whitespace.
export const normalizeName = (s: string) =>
  s.toLowerCase().replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim()

export function samePerson(
  member: { name?: string | null; email?: string | null } | null | undefined,
  user: { name: string; email: string | null }
): boolean {
  if (!member?.name) return false
  if (member.email && user.email && member.email.toLowerCase() === user.email.toLowerCase()) return true
  return normalizeName(member.name) === normalizeName(user.name)
}
