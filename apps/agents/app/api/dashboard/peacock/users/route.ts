import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/users — portal users, for the post Owner picker
// (the platform's stand-in for Monday's Owner column).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = await clerkClient()
    const { data } = await client.users.getUserList({ limit: 200, orderBy: '-created_at' })
    const users = data.map((u) => ({
      id: u.id,
      name:
        [u.firstName, u.lastName].filter(Boolean).join(' ') ||
        u.username ||
        u.emailAddresses[0]?.emailAddress ||
        'Unknown',
      email: u.emailAddresses[0]?.emailAddress ?? null,
      imageUrl: u.imageUrl ?? null,
    }))
    return NextResponse.json({ users })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to list users'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
