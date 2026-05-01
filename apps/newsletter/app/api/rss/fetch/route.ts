import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import RssSource from '@/lib/models/RssSource'
import { fetchAllFeeds } from '@/lib/services/rssService'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const sources = await RssSource.find({ userId, isActive: true })
  const items = await fetchAllFeeds(sources, 7)

  const countBySource: Record<string, number> = {}
  for (const item of items) {
    countBySource[item.feedName] = (countBySource[item.feedName] ?? 0) + 1
  }

  return NextResponse.json({ total: items.length, bySource: countBySource })
}
