import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import Newsletter from '@/lib/models/Newsletter'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const newsletters = await Newsletter.find({ userId })
    .select('title date status llmProvider topics')
    .sort({ date: -1 })
    .limit(50)

  return NextResponse.json(newsletters)
}
