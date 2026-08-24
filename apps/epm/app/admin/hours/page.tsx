import { redirect } from 'next/navigation'
import { resolveEpmAccess } from '@/lib/server/anaAccess'
import HoursStatusClient from '@/components/HoursStatusClient'

// Admin-only hours status: TimeEntry totals per project vs the live Monday
// timesheet boards, for auditing the Monday→portal hours migration. Slated to
// become part of the admin console.
export const dynamic = 'force-dynamic'

export default async function AdminHoursPage() {
  const { admin } = await resolveEpmAccess()
  if (!admin) redirect('/dashboard')

  return (
    <div
      className="flex-1 min-h-0 flex flex-col -mx-6 -my-6 px-6 py-4"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <HoursStatusClient />
    </div>
  )
}
