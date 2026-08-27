import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import AppHeader from '@/components/AppHeader'
import AdminNav from './AdminNav'

// Admin Console shell — owns the gate + chrome so module pages don't repeat it.
// The proxy already edge-gates /admin(.*); this is the defense-in-depth check.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminId = await requireAdmin()
  if (!adminId) redirect('/dashboard')

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}
    >
      <AppHeader />
      <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col lg:flex-row gap-6">
        <AdminNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
