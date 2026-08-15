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

import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai'

const GEMINI_TEXT_MODEL = 'gemini-2.5-flash'
// Video understanding needs the "thinking" a real model does over the whole
// clip (spotting where speech is mixed-language, catching Revit/BIM jargon a
// flash-tier pass tends to garble) — unlike the fragment-translation job
// above, this is a single call per video, not thousands, so pro's slower
// per-call latency (seconds-to-tens-of-seconds, not the batched 20-70s that
// ruled it out for translateBatch) is affordable here.
const GEMINI_VIDEO_MODEL = 'gemini-2.5-pro'
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

const FILE_POLL_INTERVAL_MS = 3000
const FILE_POLL_MAX_ATTEMPTS = 60 // 3min — plenty for a single tutorial-length clip to leave PROCESSING

export interface VideoTranscriptResult {
  language: string
  textOriginal: string
  textEn: string
  textHe: string
}

function parseJsonObject<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch { return null }
    }
    return null
  }
}

// Uploads the video to Gemini's Files API (inline bytes are capped far below
// a tutorial video's size; Files API handles up to 2GB and is the documented
// path for video/audio input), waits for it to leave PROCESSING, asks Gemini
// to transcribe the actual spoken audio (language not assumed — these Revit
// tutorials mix Hebrew and English depending on the video) and translate
// that transcript into both languages, then deletes the uploaded copy —
// nothing here needs to persist on Gemini's side once the response is in.
export async function geminiTranscribeVideo(bytes: Buffer, mimeType: string): Promise<VideoTranscriptResult> {
  const ai = getClient()
  const uploaded = await ai.files.upload({ file: new Blob([new Uint8Array(bytes)], { type: mimeType }), config: { mimeType } })
  if (!uploaded.name) throw new Error('Gemini: file upload returned no name')

  let file = uploaded
  for (let attempt = 0; file.state === 'PROCESSING' && attempt < FILE_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, FILE_POLL_INTERVAL_MS))
    file = await ai.files.get({ name: uploaded.name })
  }
  if (file.state !== 'ACTIVE') {
    throw new Error(`Gemini: file never became ACTIVE (state=${file.state})`)
  }
  if (!file.uri || !file.mimeType) throw new Error('Gemini: active file missing uri/mimeType')

  try {
    const prompt = `This is an internal training video for EasyBIM, a BIM engineering practice — a screen-recorded Revit/BIM tutorial. Transcribe the actual spoken narration exactly as spoken (the speaker may switch between Hebrew and English, or speak only one of them — transcribe what you actually hear, do not assume). Then translate that full transcript into natural, technically accurate English and Hebrew, as a BIM professional would write it — keep software/product names and BIM-specific terms (e.g. "Revit", "Worksets", "Copy Monitor", "Acquire Coordinates", "Dynamo") as commonly used by BIM professionals rather than translating them literally when that would be unnatural.

Return ONLY a JSON object, no markdown, no commentary, shaped exactly as:
{"language":"he"|"en"|"mixed","textOriginal":"...","textEn":"...","textHe":"..."}

If the original narration is already English, textEn should equal textOriginal (and textHe its translation) — and vice versa for Hebrew.`

    const response = await ai.models.generateContent({
      model: GEMINI_VIDEO_MODEL,
      contents: createUserContent([prompt, createPartFromUri(file.uri, file.mimeType)]),
    })
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini: empty transcript response')
    const parsed = parseJsonObject<VideoTranscriptResult>(text)
    if (!parsed || typeof parsed.textOriginal !== 'string') {
      throw new Error('Gemini: unparsable transcript response')
    }
    return {
      language: parsed.language || 'mixed',
      textOriginal: parsed.textOriginal || '',
      textEn: parsed.textEn || '',
      textHe: parsed.textHe || '',
    }
  } finally {
    await ai.files.delete({ name: uploaded.name }).catch(() => {})
  }
}
