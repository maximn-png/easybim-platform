import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin, STAFF_EMAIL_DOMAIN } from '@/lib/adminApi'
import { CARDS } from '@/lib/cards'

// POST /api/admin/users/bulk-grant — grant every @easybim.co.il user all cards.
// Admins and users who already hold every card are left untouched.
export async function POST() {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const allApps = CARDS.map((c) => c.id)

  try {
    const client = await clerkClient()
    const { data: users } = await client.users.getUserList({ limit: 500 })

    let updated = 0
    let alreadySet = 0
    for (const user of users) {
      const email = (
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        ''
      ).toLowerCase()
      if (!email.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) continue
      if (user.publicMetadata?.admin === true) {
        alreadySet++
        continue
      }
      const current = Array.isArray(user.publicMetadata?.apps)
        ? (user.publicMetadata.apps as string[])
        : []
      if (allApps.every((a) => current.includes(a))) {
        alreadySet++
        continue
      }
      await client.users.updateUserMetadata(user.id, { publicMetadata: { apps: allApps } })
      updated++
    }

    return NextResponse.json({ ok: true, updated, alreadySet, domain: STAFF_EMAIL_DOMAIN })
  } catch (err) {
    console.error('[admin/bulk-grant] failed:', err)
    return NextResponse.json({ error: 'Failed to update staff permissions' }, { status: 500 })
  }
}
