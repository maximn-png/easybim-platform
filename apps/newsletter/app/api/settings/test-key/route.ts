import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { testCohereKey } from '@/lib/services/cohereService'
import { testGeminiKey } from '@/lib/services/geminiService'

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

  if (!apiKey) return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })

  const maskedKey = `${apiKey.slice(0, 8)}${'*'.repeat(12)}`
  console.log(`\n[test-key] ── Starting ${provider.toUpperCase()} key test ──`)
  console.log(`[test-key] userId=${userId} | key=${maskedKey}`)

  try {
    const result = provider === 'cohere'
      ? await testCohereKey(apiKey)
      : await testGeminiKey(apiKey)

    console.log(`[test-key] ── Result: ${result.ok ? '✓ SUCCESS' : '✗ FAILED'} ──\n`)

    if (result.ok) {
      return NextResponse.json({ ok: true, logs: result.logs, models: result.models ?? [] })
    } else {
      return NextResponse.json({ ok: false, logs: result.logs, models: [] }, { status: 401 })
    }
  } catch (err) {
    const msg = (err as Error).message
    console.error(`[test-key] Unexpected error: ${msg}`)
    return NextResponse.json({ ok: false, logs: [`Unexpected server error: ${msg}`], models: [] }, { status: 500 })
  }
}
