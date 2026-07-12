import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin, sanitizeApps } from '@/lib/adminApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_INVITES = 20

// POST /api/admin/invitations — invite one or more users by email with
// pre-set card grants. Works for any email domain. Each invitation is
// created individually so one bad address doesn't sink the batch.
export async function POST(req: NextRequest) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  const raw: unknown[] = Array.isArray(body?.emails)
    ? body.emails
    : typeof body?.email === 'string'
      ? [body.email]
      : []
  const emails = [
    ...new Set(
      raw
        .filter((e): e is string => typeof e === 'string')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]

  if (emails.length === 0) {
    return NextResponse.json({ error: 'At least one email address is required' }, { status: 400 })
  }
  if (emails.length > MAX_INVITES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_INVITES} invitations at a time` },
      { status: 400 }
    )
  }

  const apps = sanitizeApps(body?.apps)
  const admin = body?.admin === true
  const redirectUrl = `${req.nextUrl.origin}/sign-up`

  const client = await clerkClient()
  const sent: string[] = []
  const failed: Array<{ email: string; reason: string }> = []

  for (const email of emails) {
    if (!EMAIL_RE.test(email)) {
      failed.push({ email, reason: 'not a valid email address' })
      continue
    }
    try {
      await client.invitations.createInvitation({
        emailAddress: email,
        publicMetadata: { admin, apps },
        redirectUrl,
      })
      sent.push(email)
    } catch (err) {
      // Clerk returns descriptive errors (duplicate invitation, existing user, …)
      const reason =
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
        'failed to create invitation'
      console.error(`[admin/invitations] create failed for ${email}:`, err)
      failed.push({ email, reason })
    }
  }

  const status = sent.length > 0 ? 200 : 400
  return NextResponse.json({ ok: sent.length > 0, sent, failed }, { status })
}
