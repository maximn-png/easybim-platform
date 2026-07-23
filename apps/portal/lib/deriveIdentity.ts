// Best-effort defaults for a user's display name and company, derived from
// their Clerk name + email. Used to pre-fill the User Management rows so an
// admin always sees something sensible (and can override later):
//   • daniel.optimizeplan@gmail.com  → company "daniel.optimizeplan" (free provider → local part)
//   • ran@iyha.org.il                → company "iyha"                (corporate → first domain label)

/** Consumer mailbox providers — for these the domain isn't a company, so we
 *  fall back to the email's local part as the company guess. */
const FREE_PROVIDERS = new Set([
  'gmail', 'googlemail', 'outlook', 'hotmail', 'live', 'msn',
  'yahoo', 'ymail', 'rocketmail', 'icloud', 'me', 'mac',
  'proton', 'protonmail', 'pm', 'aol', 'gmx', 'mail', 'zoho',
  'walla', 'nana', 'nana10', '012', 'bezeqint', 'netvision',
])

/** Title-case a slug like "daniel.optimizeplan" → "Daniel Optimizeplan". */
function prettify(local: string): string {
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function splitEmail(email: string): { local: string; domain: string } {
  const at = email.lastIndexOf('@')
  if (at < 0) return { local: email.trim().toLowerCase(), domain: '' }
  return {
    local: email.slice(0, at).trim().toLowerCase(),
    domain: email.slice(at + 1).trim().toLowerCase(),
  }
}

/** Display name: Clerk first+last if present, else a prettified email local part. */
export function deriveName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string
): string {
  const full = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (full) return full
  const { local } = splitEmail(email)
  return local ? prettify(local) : ''
}

/** Company guess from the email — see file header for the rule. */
export function deriveCompany(email: string): string {
  const { local, domain } = splitEmail(email)
  if (!domain) return ''
  const firstLabel = domain.split('.')[0] ?? ''
  if (FREE_PROVIDERS.has(firstLabel)) return local
  return firstLabel
}
