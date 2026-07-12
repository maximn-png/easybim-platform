import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { AppHeader } from '@easybim/ui'
import { logAppVisit } from '@easybim/db'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'EasyBIM Projects',
  description: 'BIM project management and tracking',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Activity log: throttled to one write per user per hour inside logAppVisit.
  const { userId } = await auth()
  if (userId) await logAppVisit(userId, 'epm').catch(() => {})

  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <AppHeader dashboardHref="/dashboard" />
          <main className="flex-1 px-6 py-6">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  )
}
