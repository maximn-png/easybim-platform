'use client'

import Image from 'next/image'
import Link from 'next/link'
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
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-[#e8eaff] px-6 py-3 flex items-center justify-between">
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
        <UserButton />
      </div>
    </header>
  )
}
