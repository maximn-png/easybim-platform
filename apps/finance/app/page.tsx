import { Landmark, Receipt, FolderOpen, BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Planned modules ("applications") this hub will manage. Each becomes its own
// page once its Monday boards / Drive sources are defined.
const MODULES = [
  {
    icon: Receipt,
    title: 'Billing Status',
    description: 'Bills and invoices per project and milestone — submitted vs pending, monthly totals.',
  },
  {
    icon: FolderOpen,
    title: 'Finance Documents',
    description: 'Contracts and invoices indexed from Google Drive, linked to their projects.',
  },
  {
    icon: BarChart3,
    title: 'Project Finance Overview',
    description: 'Contract totals, billed-to-date, and cost insight across all active projects.',
  },
]

export default function FinanceHome() {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000'

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: '#10b98122', color: '#059669' }}
      >
        <Landmark size={32} />
      </div>

      <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
        Finance Management
      </h1>
      <p className="mt-3 max-w-xl text-base opacity-70">
        EasyBIM&apos;s financial hub — data synced from monday.com and Google
        Drive into a dedicated finance database.
      </p>

      <div className="mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-3 text-left">
        {MODULES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-xl border border-black/10 bg-black/[.02] p-5 dark:border-white/10 dark:bg-white/[.03]"
          >
            <Icon size={20} className="text-emerald-600 dark:text-emerald-400" />
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-70">{description}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 w-full max-w-3xl rounded-xl border border-black/10 bg-black/[.02] p-5 text-left text-sm dark:border-white/10 dark:bg-white/[.03]">
        <p className="font-semibold">Wiring status</p>
        <p className="mt-1 opacity-70">
          Clerk auth, MongoDB, Monday, and Google Drive clients are set up. Hit{' '}
          <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
            /api/health
          </code>{' '}
          to confirm every integration connects with your{' '}
          <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
            .env.local
          </code>
          .
        </p>
      </div>

      <a
        href={portalUrl}
        className="mt-8 text-sm font-medium underline underline-offset-4 opacity-70 hover:opacity-100"
      >
        ← Back to the EasyBIM Platform
      </a>
    </main>
  )
}
