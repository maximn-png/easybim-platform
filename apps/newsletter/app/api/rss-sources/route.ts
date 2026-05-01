import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import RssSource from '@/lib/models/RssSource'
import { DEFAULT_RSS_FEEDS } from '@/lib/constants/rssFeeds'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const count = await RssSource.countDocuments({ userId })

  if (count === 0) {
    await RssSource.insertMany(
      DEFAULT_RSS_FEEDS.map((feed) => ({ ...feed, userId, isActive: true }))
    )
  }

  const sources = await RssSource.find({ userId }).sort({ category: 1, name: 1 })
  return NextResponse.json(sources)
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, url, category } = body

  if (!name || !url || !category) {
    return NextResponse.json({ error: 'name, url, category are required' }, { status: 400 })
  }

  await connectDB()

  const source = await RssSource.create({ name, url, category, userId, isActive: true })
  return NextResponse.json(source, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, isActive } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await connectDB()

  const source = await RssSource.findOneAndUpdate(
    { _id: id, userId },
    { isActive },
    { new: true }
  )

  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(source)
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await connectDB()
  await RssSource.findOneAndDelete({ _id: id, userId })
  return NextResponse.json({ success: true })
}
