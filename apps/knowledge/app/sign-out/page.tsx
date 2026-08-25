'use client'

import { useEffect } from 'react'
import { useClerk } from '@clerk/nextjs'

// The Knowledge Center's own account popover (template.html) is a static
// design mockup — its "Sign out" button only ever showed a "(demo)" toast,
// never a real sign-out, because that popover lives on a raw HTML route
// (app/route.ts) served outside the ClerkProvider tree, with no Clerk
// client SDK loaded on the page at all. kc-api.js intercepts that button's
// click and redirects here instead — a normal page, so it's wrapped by the
// root layout's <ClerkProvider>, giving it real access to Clerk's client SDK.
export default function SignOutPage() {
  const { signOut } = useClerk()

  useEffect(() => {
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000'
    signOut({ redirectUrl: `${portalUrl}/sign-in` })
  }, [signOut])

  return null
}
