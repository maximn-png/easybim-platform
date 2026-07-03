import { connectDB } from '@/lib/db/mongoose'
import AgentGuidance from '@/lib/models/AgentGuidance'

// Durable, per-agent guidance lines (shared AgentGuidance model, keyed by agentKey).
export async function getGuidance(agentKey: string): Promise<string[]> {
  await connectDB()
  const docs = await AgentGuidance.find({ agentKey, active: true }).sort({ createdAt: -1 }).limit(50).lean()
  return docs.map((d) => d.text)
}

export async function addGuidance(agentKey: string, text: string, createdBy?: string): Promise<void> {
  await connectDB()
  await AgentGuidance.create({ agentKey, text: text.trim(), createdBy })
}

export function guidanceBlock(lines: string[]): string {
  if (lines.length === 0) return ''
  const bullets = lines.map((l) => `- ${l}`).join('\n')
  return `\nהנחיות נוספות שמקסים נתן (Guidance מצטבר, גובר על ברירות מחדל כשרלוונטי):\n${bullets}`
}
