import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Notification from '@/lib/models/Notification'

// GET /api/kc/notifications — the current user's own inbox, newest first.
// Real replacement for toasts that used to claim "author notified" with no
// notification mechanism behind them (kc-teamlead.js's doReject).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const items = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean()
  const unreadCount = await Notification.countDocuments({ userId, read: false })

  return NextResponse.json({
    items: items.map((n) => ({ id: String(n._id), message: n.message, read: n.read, createdAt: n.createdAt })),
    unreadCount,
  })
}
