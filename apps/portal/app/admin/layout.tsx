import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
      <div className="max-w-[1400px] mx-auto px-6 pt-4 pb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors hover:bg-white mb-4"
          style={{ background: 'rgba(30,36,140,0.06)', borderColor: 'rgba(30,36,140,0.20)', color: '#1e248c' }}
        >
          <ArrowLeft size={12} style={{ color: '#44b8d3' }} />
          Back to portal
        </Link>
        <div className="flex flex-col lg:flex-row gap-6">
          <AdminNav />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  )
}
