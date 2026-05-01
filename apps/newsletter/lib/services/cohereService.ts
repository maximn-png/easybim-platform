const COHERE_BASE = 'https://api.cohere.com/v2'
const COHERE_MODEL = 'command-a-03-2025'

export async function cohereChat(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(`${COHERE_BASE}/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: COHERE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Cohere API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const text = data?.message?.content?.[0]?.text
  if (!text) throw new Error('Cohere: empty response')
  return text
}

export interface TestKeyResult {
  ok: boolean
  logs: string[]
  models?: string[]
}

export async function testCohereKey(apiKey: string): Promise<TestKeyResult> {
  const logs: string[] = []
  const maskedKey = `${apiKey.slice(0, 8)}${'*'.repeat(12)}`

  // ── Step 1: validate key with a chat request ──────────────────────────────
  const chatUrl = `${COHERE_BASE}/chat`
  logs.push(`[1/2] Testing key with chat request`)
  logs.push(`  → POST ${chatUrl}`)
  logs.push(`  Key: ${maskedKey}`)
  console.log(`[cohere] POST ${chatUrl} | key: ${maskedKey}`)

  const t0 = Date.now()
  let reply = ''
  try {
    reply = await cohereChat('You are a test assistant.', 'Reply with the single word OK', apiKey)
    const ms = Date.now() - t0
    logs.push(`  ← 200 OK (${ms}ms)`)
    logs.push(`  Response: "${reply.slice(0, 80)}"`)
    console.log(`[cohere] ← 200 OK (${ms}ms) | response: "${reply.slice(0, 80)}"`)
  } catch (err) {
    const ms = Date.now() - t0
    const msg = (err as Error).message
    logs.push(`  ← ERROR (${ms}ms): ${msg}`)
    console.error(`[cohere] ← ERROR (${ms}ms): ${msg}`)
    return { ok: false, logs }
  }

  // ── Step 2: list available models ────────────────────────────────────────
  const modelsUrl = `${COHERE_BASE}/models`
  logs.push(`[2/2] Fetching available models`)
  logs.push(`  → GET ${modelsUrl}`)
  console.log(`[cohere] GET ${modelsUrl}`)

  const t1 = Date.now()
  try {
    const res = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const ms = Date.now() - t1
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name)
    logs.push(`  ← 200 OK (${ms}ms) — ${models.length} models found`)
    models.forEach(m => logs.push(`    • ${m}`))
    console.log(`[cohere] ← ${models.length} models:`, models)
    return { ok: true, logs, models }
  } catch (err) {
    const ms = Date.now() - t1
    const msg = (err as Error).message
    logs.push(`  ← ERROR fetching models (${ms}ms): ${msg}`)
    console.error(`[cohere] ← models error (${ms}ms): ${msg}`)
    return { ok: true, logs } // key is valid even if model list fails
  }
}
