import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin, sanitizeApps } from '@/lib/adminApi'

// PATCH /api/admin/users/:userId — update a user's card grants / admin flag.
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

  const update: { admin?: boolean; apps?: string[] } = {}
  if ('apps' in body) update.apps = sanitizeApps(body.apps)
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
