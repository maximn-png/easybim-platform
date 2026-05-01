import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { geminiGenerateImage } from '@/lib/services/geminiService'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, geminiApiKey } = await req.json()
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const key = geminiApiKey || process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 400 })

  try {
    const base64 = await geminiGenerateImage(prompt, key)
    return NextResponse.json({ base64 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
