import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Notification from '@/lib/models/Notification'

// POST /api/kc/notifications/read-all — called when the notifications
// panel is opened; clears the unread badge.
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  await Notification.updateMany({ userId, read: false }, { $set: { read: true } })
  return NextResponse.json({ ok: true })
}
