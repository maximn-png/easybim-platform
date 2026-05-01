import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import StyleProfile from '@/lib/models/StyleProfile'
import { DEFAULT_STYLE_PROFILE, STYLE_ANALYSIS_PROMPT } from '@/lib/constants/prompts'
import { cohereChat } from '@/lib/services/cohereService'
import { geminiChat } from '@/lib/services/geminiService'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const profile = await StyleProfile.findOne({ userId })
  return NextResponse.json(profile ?? { styleNotes: DEFAULT_STYLE_PROFILE })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { linkedinPosts, cohereApiKey, geminiApiKey } = await req.json()

  if (!linkedinPosts?.length) {
    return NextResponse.json({ error: 'linkedinPosts required' }, { status: 400 })
  }

  const postsText = (linkedinPosts as string[]).join('\n\n---\n\n')
  const prompt = STYLE_ANALYSIS_PROMPT(postsText)

  let styleNotes = DEFAULT_STYLE_PROFILE
  try {
    const key = cohereApiKey || process.env.COHERE_API_KEY
    if (key) {
      styleNotes = await cohereChat('You are a writing style analyst.', prompt, key)
    } else {
      const gKey = geminiApiKey || process.env.GEMINI_API_KEY
      if (gKey) styleNotes = await geminiChat(prompt, gKey)
    }
  } catch (err) {
    console.warn('[StyleProfile] LLM analysis failed, using default:', err)
  }

  await connectDB()
  const profile = await StyleProfile.findOneAndUpdate(
    { userId },
    { userId, linkedinPosts, styleNotes, updatedAt: new Date() },
    { upsert: true, new: true }
  )

  return NextResponse.json(profile)
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  await StyleProfile.findOneAndDelete({ userId })
  return NextResponse.json({ success: true, styleNotes: DEFAULT_STYLE_PROFILE })
}
