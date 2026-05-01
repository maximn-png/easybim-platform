'use client'

import Image from 'next/image'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-[#e8eaff] px-6 py-3 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-3">
        <Image
          src="/easybim_logo-b.png"
          alt="EasyBIM"
          width={130}
          height={42}
          className="object-contain"
          priority
        />
        <span className="text-sm font-semibold text-[#6b7280] border-l border-[#e8eaff] pl-3">
          Internal Tools
        </span>
      </Link>
      <UserButton />
    </header>
  )
}
