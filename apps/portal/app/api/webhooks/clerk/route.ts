import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { clerkClient } from '@clerk/nextjs/server'
import { deriveName, deriveCompany } from '@/lib/deriveIdentity'
import { sendGmail } from '@/lib/gmail'

// Clerk webhook receiver. Currently handles `user.created` — derives a default
// name/company for the new account and emails an admin so a self-registered
// user can be granted (or denied) access from /admin/users.
//
// Setup: in the Clerk dashboard add an endpoint at /api/webhooks/clerk
// subscribed to `user.created`, and put its signing secret in
// CLERK_WEBHOOK_SIGNING_SECRET. This route must stay public (see proxy.ts).

const NOTIFY_TO = process.env.NEW_USER_NOTIFY_EMAIL || 'maxim.n@easybim.co.il'
const TOLERANCE_SECONDS = 5 * 60

/** Verify a Svix (Clerk) signature over the raw body. Returns true if valid. */
function verifySignature(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatureHeader = headers.get('svix-signature')
  if (!id || !timestamp || !signatureHeader) return false

  // Reject stale deliveries (replay guard).
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${id}.${timestamp}.${body}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64')

  // Header is a space-separated list of "v1,<sig>" entries — accept any match.
  for (const part of signatureHeader.split(' ')) {
    const sig = part.split(',')[1]
    if (!sig) continue
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return false
}

interface ClerkUserEvent {
  type: string
  data: {
    id: string
    first_name?: string | null
    last_name?: string | null
    image_url?: string
    primary_email_address_id?: string | null
    email_addresses?: Array<{ id: string; email_address: string }>
    public_metadata?: Record<string, unknown>
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
  if (!secret) {
    console.error('[webhooks/clerk] CLERK_WEBHOOK_SIGNING_SECRET not configured')
    return new NextResponse('Webhook not configured', { status: 500 })
  }

  const body = await req.text()
  if (!verifySignature(secret, req.headers, body)) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  let event: ClerkUserEvent
  try {
    event = JSON.parse(body) as ClerkUserEvent
  } catch {
    return new NextResponse('Invalid payload', { status: 400 })
  }

  if (event.type !== 'user.created') {
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  const { data } = event
  const email =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    ''

  // Derive + persist a default name/company, unless the account already carries
  // them (e.g. it was created from an admin invitation).
  const existingName =
    typeof data.public_metadata?.name === 'string' ? data.public_metadata.name : ''
  const existingCompany =
    typeof data.public_metadata?.company === 'string' ? data.public_metadata.company : ''
  const name = existingName || deriveName(data.first_name, data.last_name, email)
  const company = existingCompany || deriveCompany(email)

  const patch: { name?: string; company?: string } = {}
  if (!existingName && name) patch.name = name
  if (!existingCompany && company) patch.company = company
  if (Object.keys(patch).length > 0) {
    try {
      const client = await clerkClient()
      await client.users.updateUserMetadata(data.id, { publicMetadata: patch })
    } catch (err) {
      console.error('[webhooks/clerk] metadata backfill failed:', err)
    }
  }

  const adminUrl = `${req.nextUrl.origin}/admin/users`
  const displayName = name || email || 'A new user'
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.6">
      <h2 style="color:#1e248c;margin:0 0 12px">New user on the EasyBIM platform</h2>
      <p>Someone just signed in to the platform for the first time and is waiting for access:</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Name</td><td><b>${escapeHtml(displayName)}</b></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#6b7280">Email</td><td>${escapeHtml(email)}</td></tr>
        ${company ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Company</td><td>${escapeHtml(company)}</td></tr>` : ''}
      </table>
      <p style="margin:18px 0">
        <a href="${adminUrl}" style="background:#1e248c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:bold;display:inline-block">
          Open User Management
        </a>
      </p>
      <p style="color:#9ca3af;font-size:13px">They have no card access until you grant it. If they shouldn't be here, remove them from the same page.</p>
    </div>
  `

  // Best-effort — a mail failure must not make Clerk retry the webhook.
  await sendGmail({
    to: NOTIFY_TO,
    subject: `New EasyBIM user: ${displayName}${email ? ` (${email})` : ''}`,
    html,
  })

  return NextResponse.json({ ok: true })
}
