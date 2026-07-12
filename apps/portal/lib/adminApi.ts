import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/access'
import { CARDS } from '@/lib/cards'

/** Company domain: "grant all staff" targets every user on this domain. */
export const STAFF_EMAIL_DOMAIN = 'easybim.co.il'

/** 401 JSON response unless the caller is an admin; otherwise their userId. */
export async function guardAdmin(): Promise<
  { adminId: string } | { error: NextResponse }
> {
  const adminId = await requireAdmin()
  if (!adminId) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 401 }) }
  }
  return { adminId }
}

/** Keep only known card ids, deduplicated. */
export function sanitizeApps(apps: unknown): string[] {
  if (!Array.isArray(apps)) return []
  const known = new Set(CARDS.map((c) => c.id))
  return [...new Set(apps.filter((a): a is string => typeof a === 'string' && known.has(a)))]
}
