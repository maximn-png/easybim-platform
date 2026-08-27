import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentGuidance from '@/lib/models/AgentGuidance'
import { getAgent } from '@/lib/core/registry'
import { addGuidance } from '@/lib/core/guidance'

export const runtime = 'nodejs'

// All improvements (guidance) the agent learned via chat — shared across users.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  if (!getAgent(agentKey)) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const docs = await AgentGuidance.find({ agentKey }).sort({ createdAt: -1 }).limit(200).lean()
  return NextResponse.json({
    guidance: docs.map((g) => ({
      id: String(g._id),
      text: g.text,
      active: g.active,
      createdBy: g.createdBy ?? null,
      createdAt: (g as { createdAt?: Date }).createdAt ?? null,
    })),
  })
}

// POST { text } — add a guidance line directly (the dashboards' "שפר להבא"
// flow lands here after the user approved the distilled instruction).
export async function POST(req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  if (!getAgent(agentKey)) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  await addGuidance(agentKey, text, userId)
  return NextResponse.json({ ok: true })
}
