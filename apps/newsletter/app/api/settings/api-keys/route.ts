import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import StyleProfile from '@/lib/models/StyleProfile'
import { encrypt } from '@/lib/utils/encryption'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    const profile = await StyleProfile
      .findOne({ userId })
      .select('cohereApiKey geminiApiKey')
      .lean() as { cohereApiKey?: string; geminiApiKey?: string } | null

    const result = {
      cohere: !!profile?.cohereApiKey,
      gemini: !!profile?.geminiApiKey,
    }
    console.log(`[api-keys GET] userId=${userId} | cohere=${result.cohere} gemini=${result.gemini}`)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api-keys GET] Error:', (err as Error).message)
    return NextResponse.json({ error: 'Failed to fetch key status' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let provider: string, apiKey: string
  try {
    const body = await req.json()
    provider = body.provider
    apiKey = body.apiKey
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!provider || !apiKey) {
    return NextResponse.json({ error: 'provider and apiKey are required' }, { status: 400 })
  }

  console.log(`[api-keys POST] Saving ${provider} key for userId=${userId}`)

  // Encrypt the key
  let encryptedKey: string
  try {
    encryptedKey = encrypt(apiKey)
    console.log(`[api-keys POST] Key encrypted successfully (${encryptedKey.length} chars)`)
  } catch (err) {
    console.error('[api-keys POST] Encryption failed:', (err as Error).message)
    return NextResponse.json({ error: `Encryption failed: ${(err as Error).message}` }, { status: 500 })
  }

  // Save to MongoDB
  try {
    await connectDB()
    const field = provider === 'cohere' ? 'cohereApiKey' : 'geminiApiKey'
    const doc = await StyleProfile.findOneAndUpdate(
      { userId },
      { $set: { userId, [field]: encryptedKey } },
      { upsert: true, new: true }
    )
    console.log(`[api-keys POST] Saved to MongoDB | collection=styleprofiles | docId=${doc._id} | field=${field}`)
    return NextResponse.json({ ok: true, message: `${provider} key saved successfully` })
  } catch (err) {
    console.error('[api-keys POST] MongoDB save failed:', (err as Error).message)
    return NextResponse.json({ error: `Database save failed: ${(err as Error).message}` }, { status: 500 })
  }
}
