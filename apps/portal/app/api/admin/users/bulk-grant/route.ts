import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin, STAFF_EMAIL_DOMAIN } from '@/lib/adminApi'
import { CARDS } from '@/lib/cards'

// POST /api/admin/users/bulk-grant — toggle ONE card for every @easybim.co.il
// user (the "EasyBIM domain" row in the admin table). Admins are skipped —
// they implicitly hold every card.
// Body: { app: string, grant: boolean }
export async function POST(req: NextRequest) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  const app = typeof body?.app === 'string' ? body.app : ''
  const grant = body?.grant === true
  if (!CARDS.some((c) => c.id === app)) {
    return NextResponse.json({ error: 'Unknown card' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    const { data: users } = await client.users.getUserList({ limit: 500 })

    let updated = 0
    for (const user of users) {
      const email = (
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        ''
      ).toLowerCase()
      if (!email.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) continue
      if (user.publicMetadata?.admin === true) continue

      const current = Array.isArray(user.publicMetadata?.apps)
        ? (user.publicMetadata.apps as string[])
        : []
      const has = current.includes(app)
      if (grant === has) continue

      const apps = grant ? [...current, app] : current.filter((a) => a !== app)
      await client.users.updateUserMetadata(user.id, { publicMetadata: { apps } })
      updated++
    }

    return NextResponse.json({ ok: true, app, grant, updated })
  } catch (err) {
    console.error('[admin/bulk-grant] failed:', err)
    return NextResponse.json({ error: 'Failed to update staff permissions' }, { status: 500 })
  }
}
