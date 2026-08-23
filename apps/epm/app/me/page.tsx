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
    <div
      className="flex-1 -mx-6 -my-6 px-6 py-6"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <MySpaceClient userName={userName} />
    </div>
  )
}
