import { redirect } from 'next/navigation'
import { clerkClient } from '@clerk/nextjs/server'
import { requireAdmin } from '@/lib/access'
import AppHeader from '@/components/AppHeader'
import UserManagement, { type AdminUser, type PendingInvitation } from './UserManagement'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const adminId = await requireAdmin()
  if (!adminId) redirect('/dashboard')

  const client = await clerkClient()
  const [{ data: users }, { data: invitations }] = await Promise.all([
    client.users.getUserList({ limit: 200, orderBy: '-created_at' }),
    client.invitations.getInvitationList({ status: 'pending', limit: 100 }),
  ])

  const serializedUsers: AdminUser[] = users.map((u) => {
    const primaryEmail =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      ''
    return {
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || primaryEmail,
      email: primaryEmail,
      imageUrl: u.imageUrl,
      lastSignInAt: u.lastSignInAt,
      admin: u.publicMetadata?.admin === true,
      apps: Array.isArray(u.publicMetadata?.apps) ? (u.publicMetadata.apps as string[]) : [],
      isSelf: u.id === adminId,
    }
  })

  const serializedInvitations: PendingInvitation[] = invitations.map((inv) => ({
    id: inv.id,
    email: inv.emailAddress,
    admin: inv.publicMetadata?.admin === true,
    apps: Array.isArray(inv.publicMetadata?.apps) ? (inv.publicMetadata.apps as string[]) : [],
    createdAt: inv.createdAt,
  }))

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}
    >
      <AppHeader />
      <UserManagement users={serializedUsers} invitations={serializedInvitations} />
    </div>
  )
}
