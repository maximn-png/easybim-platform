'use client'

// Admin Console module rail. Vertical on desktop, horizontal pill row on
// small screens. Hours Status lives in the EPM app (it needs EPM's database
// and Monday services) so its item is an external link.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Users, RefreshCw, Bot, Activity, HeartPulse, Clock, ExternalLink,
} from 'lucide-react'

const NAVY = '#1e248c'
const EPM_URL = process.env.NEXT_PUBLIC_EPM_URL || 'http://localhost:3002'

const ITEMS = [
  { label: 'Overview',     href: '/admin',              icon: LayoutGrid },
  { label: 'Users',        href: '/admin/users',        icon: Users },
  { label: 'Sync Health',  href: '/admin/sync',         icon: RefreshCw },
  { label: 'Agent Runs',   href: '/admin/agents',       icon: Bot },
  { label: 'Activity',     href: '/admin/activity',     icon: Activity },
  { label: 'Integrations', href: '/admin/integrations', icon: HeartPulse },
]

export default function AdminNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/')

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-colors whitespace-nowrap ${
      active ? 'bg-white shadow-sm' : 'hover:bg-white/60'
    }`

  return (
    <nav className="lg:w-52 shrink-0">
      <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
        {ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link key={href} href={href} className={itemClass(active)} style={{ color: NAVY }}>
              <Icon size={15} style={{ color: active ? '#44b8d3' : 'rgba(30,36,140,0.55)' }} />
              {label}
            </Link>
          )
        })}
        <a
          href={`${EPM_URL}/admin/hours`}
          target="_blank"
          rel="noreferrer"
          className={itemClass(false)}
          style={{ color: NAVY }}
        >
          <Clock size={15} style={{ color: 'rgba(30,36,140,0.55)' }} />
          Hours Status
          <ExternalLink size={11} className="ml-auto" style={{ color: '#9ca3af' }} />
        </a>
      </div>
    </nav>
  )
}
