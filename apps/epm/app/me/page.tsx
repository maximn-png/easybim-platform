import { currentUser } from '@clerk/nextjs/server'
import MySpaceClient from '@/components/MySpaceClient'

// Per-user page — everything on it depends on the signed-in user.
export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await currentUser()
  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.primaryEmailAddress?.emailAddress ||
    'there'

  return (
    // epm-one-screen: locks the body to the viewport (≥1024px) — the three
    // cards fill the remaining height and scroll internally instead.
    <div
      className="epm-one-screen flex-1 min-h-0 flex flex-col -mx-6 -my-6 px-6 py-4"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <MySpaceClient userName={userName} />
    </div>
  )
}
