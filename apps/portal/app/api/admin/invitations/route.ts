import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin, sanitizeApps } from '@/lib/adminApi'

// POST /api/admin/invitations — invite a user by email with pre-set card grants.
// Works for any email domain (Gmail, Outlook, client corporate domains, …).
export async function POST(req: NextRequest) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }

  const apps = sanitizeApps(body?.apps)
  const admin = body?.admin === true

  try {
    const client = await clerkClient()
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { admin, apps },
      // Land invitees on the portal's sign-up, which consumes the invitation ticket.
      redirectUrl: `${req.nextUrl.origin}/sign-up`,
    })
    return NextResponse.json({ ok: true, id: invitation.id, email: invitation.emailAddress })
  } catch (err) {
    // Clerk returns descriptive errors (duplicate invitation, existing user, …) —
    // surface the first message so the admin sees why the invite was rejected.
    const message =
      (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
      'Failed to create invitation'
    console.error('[admin/invitations] create failed:', err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
