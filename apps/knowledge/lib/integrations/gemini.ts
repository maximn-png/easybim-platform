// Google Gemini client, scoped locally to apps/knowledge. Reads GEMINI_API_KEY
// directly from env (knowledge has no per-user key setting, unlike newsletter).
//
// gemini-2.5-flash, thinking disabled: this is only ever used for one
// mechanical job (translate N short text fragments, return a JSON array in
// the same order) — no multi-step reasoning involved. gemini-2.5-pro's
// default "thinking" mode was measured at 20-70s PER 30-fragment batch here
// (thousands of reasoning tokens spent per call before it writes any output),
// which for a real ~200-block document (7-8 batches) ran long enough to hit a
// socket-level timeout partway through and never finish. gemini-2.5-flash
// with thinkingBudget:0 (pro doesn't support disabling it — 0 is rejected as
// invalid for that model) produced equally correct translations in ~2-8s per
// batch in testing against real digested documents.

import { GoogleGenAI } from '@google/genai'

const GEMINI_TEXT_MODEL = 'gemini-2.5-flash'
// 'text-embedding-004' 404s against this API key/project (v1beta doesn't
// list it as embedContent-capable here) — confirmed live against the real
// key: 'gemini-embedding-001' works, 3072-dim vectors.
const GEMINI_EMBED_MODEL = 'gemini-embedding-001'

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  return new GoogleGenAI({ apiKey })
}

export async function geminiChat(prompt: string): Promise<string> {
  const ai = getClient()
  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: { thinkingConfig: { thinkingBudget: 0 } },
  })
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini: empty text response')
  return text
}

// Used by the Mentor's real retrieval (lib/kc/embeddings.ts / lib/kc/search.ts) —
// one call embeds a whole batch, response order matches input order.
export async function geminiEmbed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  const ai = getClient()
  const response = await ai.models.embedContent({
    model: GEMINI_EMBED_MODEL,
    contents: texts,
  })
  const embeddings = response.embeddings
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error(`Gemini embed: expected ${texts.length} embeddings, got ${embeddings ? embeddings.length : 'none'}`)
  }
  return embeddings.map((e) => e.values || [])
}
