import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import { getAgent } from '@/lib/core/registry'

export const runtime = 'nodejs'

// Recent runs for an agent. Protected by proxy.ts (signed-in users only).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  if (!getAgent(agentKey)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  }
  await connectDB()
  const runs = await AgentRun.find({ agentKey }).sort({ startedAt: -1 }).limit(30).lean()
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: String(r._id),
      pass: r.pass,
      trigger: r.trigger,
      status: r.status,
      summary: r.summary ?? null,
      error: r.error ?? null,
      context: r.context ?? null,
      inputTokens: r.inputTokens ?? null,
      outputTokens: r.outputTokens ?? null,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt ?? null,
    })),
  })
}
