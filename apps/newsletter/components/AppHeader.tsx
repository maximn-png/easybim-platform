'use client'

import Image from 'next/image'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Sparkles, Settings } from 'lucide-react'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/generate',  label: 'Generate',  icon: Sparkles },
  { href: '/settings',  label: 'Settings',  icon: Settings },
]

export default function AppHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-[#e8eaff] px-6 py-3 flex items-center justify-between">
      <Link href="/dashboard">
        <Image
          src="/easybim_logo-w.png"
          alt="EasyBIM"
          width={130}
          height={42}
          className="object-contain"
          priority
        />
      </Link>

      <nav className="hidden md:flex items-center gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? 'bg-[#1e248c] text-white shadow-sm shadow-[#1e248c]/20'
                  : 'text-[#6b7280] hover:text-[#1e248c] hover:bg-[#f0f2ff]'
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          )
        })}
      </nav>

      <UserButton />
    </header>
  )
}
