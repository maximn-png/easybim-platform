import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin, sanitizeApps } from '@/lib/adminApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_INVITES = 20
const MAX_FIELD = 80

const cleanField = (v: unknown): string =>
  typeof v === 'string' ? v.trim().slice(0, MAX_FIELD) : ''

// POST /api/admin/invitations — invite one or more users by email with
// pre-set card grants plus a per-person name and company. Both are embedded
// in the invitation's public_metadata: the Hebrew email template renders
// them, and Clerk copies them onto the user account at sign-up. Each
// invitation is created individually so one bad address doesn't sink the
// batch.
export async function POST(req: NextRequest) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  // New shape: invites: [{ email, name, company }]. Legacy shapes (emails /
  // email) still accepted for callers that predate the name/company fields.
  const rawInvites: unknown[] = Array.isArray(body?.invites)
    ? body.invites
    : Array.isArray(body?.emails)
      ? body.emails.map((email: unknown) => ({ email }))
      : typeof body?.email === 'string'
        ? [{ email: body.email }]
        : []

  const seen = new Set<string>()
  const invites: Array<{ email: string; name: string; company: string }> = []
  for (const raw of rawInvites) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : ''
    if (!email || seen.has(email)) continue
    seen.add(email)
    invites.push({ email, name: cleanField(r.name), company: cleanField(r.company) })
  }

  if (invites.length === 0) {
    return NextResponse.json({ error: 'At least one email address is required' }, { status: 400 })
  }
  if (invites.length > MAX_INVITES) {
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

  for (const { email, name, company } of invites) {
    if (!EMAIL_RE.test(email)) {
      failed.push({ email, reason: 'not a valid email address' })
      continue
    }
    try {
      await client.invitations.createInvitation({
        emailAddress: email,
        publicMetadata: { admin, apps, name, company },
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
