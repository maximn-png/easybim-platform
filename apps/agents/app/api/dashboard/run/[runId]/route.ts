import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'
import AgentMessage from '@/lib/models/AgentMessage'

export const runtime = 'nodejs'

// One run + its messages (the thread). Protected by proxy.ts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  await connectDB()
  const run = await AgentRun.findById(runId).lean()
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  const messages = await AgentMessage.find({ runId }).sort({ createdAt: 1 }).lean()
  return NextResponse.json({
    run: {
      id: String(run._id),
      pass: run.pass,
      trigger: run.trigger,
      status: run.status,
      summary: run.summary ?? null,
      error: run.error ?? null,
      context: run.context ?? null,
      inputTokens: run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
    },
    messages: messages.map((m) => ({
      id: String(m._id),
      role: m.role,
      content: m.content,
      fromAgentKey: m.fromAgentKey ?? null,
      toolName: m.toolName ?? null,
      createdAt: (m as { createdAt?: Date }).createdAt ?? null,
    })),
  })
}
