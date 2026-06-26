import { GoogleGenAI } from '@google/genai'

// Nano Banana — the only image model the EasyBIM key can call via generateContent
// (verified 2026-06-26; gemini-2.0-flash-preview-image-generation and imagen-3 404).
const IMAGE_MODEL = 'gemini-2.5-flash-image'

function client(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured')
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
}

// Brand direction for every generated image. Keep visual, not textual — LinkedIn
// covers read better without baked-in words, and text-in-image often renders badly.
const BRAND_DIRECTION = [
  'Visual style: EasyBIM brand — deep indigo (#1e248c) as the dominant tone with a cyan (#44b8d3) accent,',
  'clean and modern, architectural / BIM / blueprint geometry, isometric or wireframe structures, generous negative space, professional and minimal.',
  'Absolutely NO text, words, letters, numbers, watermarks, or logos in the image. No people faces. 16:9 landscape composition suitable as a LinkedIn post cover.',
].join(' ')

export interface GeneratedImage {
  base64: string
  mimeType: string
}

/** Generate an on-brand LinkedIn cover image for a post. Returns inline image data. */
export async function generatePostImage(postText: string, postType: string): Promise<GeneratedImage> {
  const prompt = [
    BRAND_DIRECTION,
    '',
    `Create a cover image for an EasyBIM (BIM engineering consultancy) LinkedIn post of type "${postType}".`,
    'Capture the theme abstractly through architectural/technical imagery — do not illustrate literally.',
    'Post content (for thematic inspiration only, do not render its text):',
    postText.slice(0, 800),
  ].join('\n')

  const res = await client().models.generateContent({ model: IMAGE_MODEL, contents: prompt })
  const parts = res?.candidates?.[0]?.content?.parts ?? []
  const img = parts.find((p) => p.inlineData?.data)
  if (!img?.inlineData?.data) {
    throw new Error('Gemini returned no image data')
  }
  return { base64: img.inlineData.data, mimeType: img.inlineData.mimeType ?? 'image/png' }
}
