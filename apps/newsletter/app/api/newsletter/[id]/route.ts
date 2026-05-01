import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import Newsletter from '@/lib/models/Newsletter'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await connectDB()

  const newsletter = await Newsletter.findOne({ _id: id, userId })
  if (!newsletter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(newsletter)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { topicIndex, body } = await req.json()

  if (topicIndex === undefined || body === undefined) {
    return NextResponse.json({ error: 'topicIndex and body required' }, { status: 400 })
  }

  await connectDB()

  const newsletter = await Newsletter.findOne({ _id: id, userId })
  if (!newsletter) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  newsletter.topics[topicIndex].body = body
  await newsletter.save()

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await connectDB()

  await Newsletter.findOneAndDelete({ _id: id, userId })
  return NextResponse.json({ success: true })
}
