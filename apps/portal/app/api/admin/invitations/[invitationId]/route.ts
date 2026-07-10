import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { guardAdmin } from '@/lib/adminApi'

// DELETE /api/admin/invitations/:invitationId — revoke a pending invitation.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const { invitationId } = await params
  try {
    const client = await clerkClient()
    await client.invitations.revokeInvitation(invitationId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/invitations] revoke failed:', err)
    return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 })
  }
}
