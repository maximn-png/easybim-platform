import Link from 'next/link'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import { CARDS } from '@/lib/cards'

// Satellites redirect here (with ?app=<id>) when a signed-in user
// lacks the grant for that app.
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>
}) {
  const { app } = await searchParams
  const card = CARDS.find((c) => c.id === app)

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}
    >
      <AppHeader />
      <main className="flex flex-col items-center text-center px-6 pt-24 gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(30,36,140,0.08)' }}
        >
          <ShieldOff size={26} style={{ color: '#1e248c' }} />
        </div>
        <h1 className="text-2xl font-black" style={{ color: '#1e248c' }}>
          No access to {card ? card.title : 'this tool'}
        </h1>
        <p className="text-sm max-w-md" style={{ color: '#6b7280' }}>
          Your account doesn&apos;t have access to this tool. If you believe you should,
          contact your EasyBIM administrator.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white mt-2"
          style={{ background: '#1e248c' }}
        >
          <ArrowLeft size={14} /> Back to your dashboard
        </Link>
      </main>
    </div>
  )
}
