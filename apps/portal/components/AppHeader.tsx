'use client'

import Image from 'next/image'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-[#e8eaff] px-6 py-3 flex items-center justify-between">
      <Link href="/dashboard">
        <Image
          src="/easybim_logo-w.png"
          alt="EasyBIM"
          width={160}
          height={52}
          className="object-contain"
          priority
        />
      </Link>
      <UserButton />
    </header>
  )
}
