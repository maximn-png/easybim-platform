'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { UserButton } from '@clerk/nextjs'

interface AppHeaderProps {
  logoSrc?: string
  dashboardHref?: string
  /** Rendered top-right, before the user avatar (e.g. admin links). */
  rightSlot?: React.ReactNode
}

export default function AppHeader({
  logoSrc = '/easybim_logo-w.png',
  dashboardHref = '/dashboard',
  rightSlot,
}: AppHeaderProps) {
  // Clerk's <UserButton> renders its host div only on the client (no SSR
  // markup in @clerk/nextjs 7), which trips React's hydration check on every
  // page. Render it after mount, behind a same-size placeholder.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-[#e8eaff] px-6 py-3 flex items-center justify-between">
      <Link href={dashboardHref}>
        <Image
          src={logoSrc}
          alt="EasyBIM"
          width={160}
          height={52}
          className="object-contain"
          style={{ height: 'auto' }}
          priority
          unoptimized
        />
      </Link>
      <div className="flex items-center gap-3">
        {rightSlot}
        {/* additionalOAuthScopes: lets any signed-in user grant the extra Google
            scopes from Manage account → Connected accounts → Reconnect. Needed
            by EPM's My Space calendar (and already-granted gmail.compose). */}
        {mounted ? (
          <UserButton
            userProfileProps={{
              additionalOAuthScopes: {
                google: ['https://www.googleapis.com/auth/calendar.readonly'],
              },
            }}
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[#e8eaff]" aria-hidden />
        )}
      </div>
    </header>
  )
}
