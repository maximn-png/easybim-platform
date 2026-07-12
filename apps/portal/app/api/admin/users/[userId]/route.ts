import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin, sanitizeApps } from '@/lib/adminApi'

const MAX_FIELD = 80

// PATCH /api/admin/users/:userId — update a user's card grants / admin flag /
// display name / company. Name and company live in publicMetadata and are
// rendered in the Hebrew invitation email for future invites.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const { userId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const update: { admin?: boolean; apps?: string[]; name?: string; company?: string } = {}
  if ('apps' in body) update.apps = sanitizeApps(body.apps)
  if ('name' in body) {
    update.name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_FIELD) : ''
  }
  if ('company' in body) {
    update.company =
      typeof body.company === 'string' ? body.company.trim().slice(0, MAX_FIELD) : ''
  }
  if ('admin' in body) {
    if (typeof body.admin !== 'boolean') {
      return NextResponse.json({ error: 'admin must be a boolean' }, { status: 400 })
    }
    // Lockout guard: an admin cannot demote themselves.
    if (userId === guard.adminId && body.admin === false) {
      return NextResponse.json(
        { error: 'You cannot remove your own admin access' },
        { status: 400 }
      )
    }
    update.admin = body.admin
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    const user = await client.users.updateUserMetadata(userId, { publicMetadata: update })
    return NextResponse.json({
      ok: true,
      admin: user.publicMetadata?.admin === true,
      apps: user.publicMetadata?.apps ?? [],
    })
  } catch (err) {
    console.error('[admin/users] update failed:', err)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

// DELETE /api/admin/users/:userId — remove a user from the platform.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const { userId } = await params
  if (userId === guard.adminId) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    await client.users.deleteUser(userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/users] delete failed:', err)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
