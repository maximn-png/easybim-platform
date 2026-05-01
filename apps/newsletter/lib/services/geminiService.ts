import { GoogleGenAI } from '@google/genai'

const GEMINI_TEXT_MODEL = 'gemini-2.5-pro'
const GEMINI_IMAGE_MODEL = 'imagen-4.0-generate-001'
const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta'

function getClient(apiKey: string) {
  return new GoogleGenAI({ apiKey })
}

export async function geminiChat(prompt: string, apiKey: string): Promise<string> {
  const ai = getClient(apiKey)
  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
  })
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini: empty text response')
  return text
}

export async function geminiGenerateImage(imagePrompt: string, apiKey: string): Promise<string> {
  const ai = getClient(apiKey)
  const response = await ai.models.generateImages({
    model: GEMINI_IMAGE_MODEL,
    prompt: imagePrompt,
    config: { numberOfImages: 1 },
  })
  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes
  if (!imageBytes) throw new Error('Imagen: no image bytes returned')
  if (typeof imageBytes === 'string') return imageBytes
  return Buffer.from(imageBytes as unknown as Uint8Array).toString('base64')
}

export interface TestKeyResult {
  ok: boolean
  logs: string[]
  models?: string[]
}

export async function testGeminiKey(apiKey: string): Promise<TestKeyResult> {
  const logs: string[] = []
  const maskedKey = `${apiKey.slice(0, 8)}${'*'.repeat(12)}`

  // ── Step 1: validate key with a generate request ──────────────────────────
  const chatUrl = `${GEMINI_REST_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent`
  logs.push(`[1/2] Testing key with generateContent request`)
  logs.push(`  → POST ${chatUrl}`)
  logs.push(`  Key: ${maskedKey}`)
  console.log(`[gemini] POST ${chatUrl} | key: ${maskedKey}`)

  const t0 = Date.now()
  try {
    const reply = await geminiChat('Reply with the single word OK', apiKey)
    const ms = Date.now() - t0
    logs.push(`  ← 200 OK (${ms}ms)`)
    logs.push(`  Response: "${reply.slice(0, 80)}"`)
    console.log(`[gemini] ← 200 OK (${ms}ms) | response: "${reply.slice(0, 80)}"`)
  } catch (err) {
    const ms = Date.now() - t0
    const msg = (err as Error).message
    logs.push(`  ← ERROR (${ms}ms): ${msg}`)
    console.error(`[gemini] ← ERROR (${ms}ms): ${msg}`)
    return { ok: false, logs }
  }

  // ── Step 2: list available models ────────────────────────────────────────
  const modelsUrl = `${GEMINI_REST_BASE}/models?key=${apiKey}`
  logs.push(`[2/2] Fetching available models`)
  logs.push(`  → GET ${GEMINI_REST_BASE}/models?key=***`)
  console.log(`[gemini] GET ${GEMINI_REST_BASE}/models`)

  const t1 = Date.now()
  try {
    const res = await fetch(modelsUrl)
    const ms = Date.now() - t1
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const models: string[] = (data.models ?? [])
      .map((m: { name: string }) => m.name.replace('models/', ''))
      .filter((name: string) => name.startsWith('gemini') || name.startsWith('imagen'))
    logs.push(`  ← 200 OK (${ms}ms) — ${models.length} models found`)
    models.forEach(m => logs.push(`    • ${m}`))
    console.log(`[gemini] ← ${models.length} models:`, models)
    return { ok: true, logs, models }
  } catch (err) {
    const ms = Date.now() - t1
    const msg = (err as Error).message
    logs.push(`  ← ERROR fetching models (${ms}ms): ${msg}`)
    console.error(`[gemini] ← models error (${ms}ms): ${msg}`)
    return { ok: true, logs }
  }
}
