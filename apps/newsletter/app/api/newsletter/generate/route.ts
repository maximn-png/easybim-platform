import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import StyleProfile from '@/lib/models/StyleProfile'
import { generateNewsletter, GenerationConfig, SSEEvent } from '@/lib/services/newsletterService'
import { decrypt, isEncrypted } from '@/lib/utils/encryption'

export const runtime = 'nodejs'
export const maxDuration = 300

function encode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const {
    llmProvider = 'gemini',
    daysBack = 7,
    topicCount = 7,
    generateImages = false,
    writingStyle = 'professional',
    activeSourceIds,
  } = body

  await connectDB()

  // Resolve per-user API keys from DB, fall back to env vars
  const styleProfile = await StyleProfile.findOne({ userId })

  const rawCohere = styleProfile?.cohereApiKey || ''
  const rawGemini = styleProfile?.geminiApiKey || ''
  const cohereApiKey = rawCohere
    ? (isEncrypted(rawCohere) ? decrypt(rawCohere) : rawCohere)
    : (process.env.COHERE_API_KEY || '')
  const geminiApiKey = rawGemini
    ? (isEncrypted(rawGemini) ? decrypt(rawGemini) : rawGemini)
    : (process.env.GEMINI_API_KEY || '')

  const config: GenerationConfig = {
    userId,
    llmProvider,
    daysBack,
    topicCount,
    generateImages,
    writingStyle,
    cohereApiKey,
    geminiApiKey,
    activeSourceIds,
  }

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: SSEEvent) => {
        controller.enqueue(new TextEncoder().encode(encode(event)))
      }

      try {
        const newsletterId = await generateNewsletter(config, push)
        push({ done: true, newsletterId })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        push({ error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
