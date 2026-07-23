// Access helpers for the ANA client area (/ana/*).
//
// The EPM proxy admits two kinds of users: full EasyBIM users (the `epm` grant,
// or admins) and external ANA client users (the `ana` grant only). ANA-only
// users are confined to /ana/* by the proxy, but the proxy runs on the edge and
// cannot reach MongoDB — so the per-PROJECT check (is this actually an ANA
// project?) lives here and runs in the Node route handlers / server components.

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveAccess } from '@easybim/auth'
import { getPartnerHubByAccountId } from '@/lib/services/apsHubs'

export interface EpmAccess {
  admin: boolean
  hasEpm: boolean
  hasAna: boolean
  /** ANA client with no internal EPM access — the constrained persona. */
  anaOnly: boolean
}

export async function resolveEpmAccess(): Promise<EpmAccess> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return { admin: false, hasEpm: false, hasAna: false, anaOnly: false }
  const access = await resolveAccess(userId, sessionClaims)
  const admin = access.admin === true
  const apps = access.apps ?? []
  const hasEpm = admin || apps.includes('epm')
  const hasAna = admin || apps.includes('ana')
  return { admin, hasEpm, hasAna, anaOnly: hasAna && !hasEpm }
}

/** True when the project doc belongs to the ANA partner hub. */
export function isAnaProjectDoc(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false
  const ext = (doc.externalIds ?? {}) as Record<string, unknown>
  return getPartnerHubByAccountId(ext.accHubId as string | undefined)?.key === 'ana'
}

// Guard for the internal /api/projects/[id]/* routes that the ANA report/detail
// UI reuses. Full EPM users pass through untouched. ANA-only users are limited
// to GET requests against projects that actually belong to the ANA hub — so a
// client can neither reach a non-ANA project by guessing its id nor mutate data.
// Returns a NextResponse to short-circuit on denial, or null to proceed.
export async function guardSharedProjectForAna(
  method: string,
  projectId: string,
): Promise<NextResponse | null> {
  const { anaOnly, hasEpm } = await resolveEpmAccess()
  if (hasEpm) return null            // internal user — unrestricted
  if (!anaOnly) {                    // neither grant (proxy should have blocked)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (method !== 'GET') {
    return NextResponse.json({ error: 'Read-only for ANA users' }, { status: 403 })
  }
  if (!process.env.MONGODB_URI) return null
  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()
  const doc = await Project.findById(projectId).select('externalIds').lean() as Record<string, unknown> | null
  if (!isAnaProjectDoc(doc)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}
