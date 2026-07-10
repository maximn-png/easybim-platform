import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentGuidance from '@/lib/models/AgentGuidance'

export const runtime = 'nodejs'

// Toggle an improvement on/off. Inactive guidance stops being injected
// into the agent's prompts (getGuidance filters on active: true).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentKey: string; guidanceId: string }> }
) {
  const { agentKey, guidanceId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (typeof body?.active !== 'boolean') return NextResponse.json({ error: 'active must be boolean' }, { status: 400 })

  await connectDB()
  const doc = await AgentGuidance.findOneAndUpdate(
    { _id: guidanceId, agentKey },
    { $set: { active: body.active } },
    { new: true }
  ).lean()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, active: doc.active })
}

// Permanently remove an improvement.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentKey: string; guidanceId: string }> }
) {
  const { agentKey, guidanceId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const res = await AgentGuidance.deleteOne({ _id: guidanceId, agentKey })
  if (res.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
