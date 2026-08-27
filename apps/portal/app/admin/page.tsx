import Link from 'next/link'
import {
  Users, RefreshCw, Bot, Activity, HeartPulse, Clock, ArrowRight, ExternalLink,
} from 'lucide-react'

// Admin Console home — module launcher. Kept static so it renders instantly;
// each module page fetches its own data.
const EPM_URL = process.env.NEXT_PUBLIC_EPM_URL || 'http://localhost:3002'

const MODULES = [
  {
    title: 'Users',
    description: 'Invite users, manage per-app access, admin rights and activity.',
    href: '/admin/users',
    icon: Users,
    color: '#1e248c',
  },
  {
    title: 'Hours Status',
    description: 'Per-project hours in the platform vs the Monday timesheets — migration audit.',
    href: `${EPM_URL}/admin/hours`,
    icon: Clock,
    color: '#44b8d3',
    external: true,
  },
  {
    title: 'Sync Health',
    description: 'EPM hourly sync runs — errors, durations, and a manual Sync Now trigger.',
    href: '/admin/sync',
    icon: RefreshCw,
    color: '#0e9488',
  },
  {
    title: 'Agent Runs & AI Cost',
    description: 'Peacock, Squirrel and Dog runs — failures, stuck runs, token usage and cost.',
    href: '/admin/agents',
    icon: Bot,
    color: '#7c3aed',
  },
  {
    title: 'Activity',
    description: 'Who uses the platform — per-app opens and visits, top cards, dormant users.',
    href: '/admin/activity',
    icon: Activity,
    color: '#d97706',
  },
  {
    title: 'Integrations',
    description: 'Health board for every app — Mongo, Clerk, Monday, Drive, APS probes.',
    href: '/admin/integrations',
    icon: HeartPulse,
    color: '#dc2626',
  },
]

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-black mb-1" style={{ color: '#1e248c' }}>Admin Console</h1>
      <p className="text-sm mb-5" style={{ color: '#6b7280' }}>
        Platform administration — users, data health and integrations in one place.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {MODULES.map((m) => {
          const Icon = m.icon
          const body = (
            <>
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${m.color}18` }}>
                  <Icon size={20} style={{ color: m.color }} />
                </div>
                {m.external && <ExternalLink size={13} style={{ color: '#9ca3af' }} />}
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-sm mb-1" style={{ color: '#111827' }}>{m.title}</h2>
                <p className="text-[12px] leading-relaxed" style={{ color: '#6b7280' }}>{m.description}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#1e248c' }}>
                Open <ArrowRight size={12} />
              </span>
            </>
          )
          const className =
            'bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 flex flex-col gap-2.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300'
          return m.external ? (
            <a key={m.title} href={m.href} target="_blank" rel="noreferrer" className={className}>{body}</a>
          ) : (
            <Link key={m.title} href={m.href} className={className}>{body}</Link>
          )
        })}
      </div>
    </div>
  )
}
