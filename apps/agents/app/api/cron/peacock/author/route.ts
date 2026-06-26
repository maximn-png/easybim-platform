import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/core/agentRuntime'
import { peacock, AUTHOR_SYSTEM, authorInstruction, buildDateContext } from '@/lib/agents/peacock'
import { getGuidance, guidanceBlock } from '@/lib/agents/peacock/guidance'

export const runtime = 'nodejs'
export const maxDuration = 300

// Vercel Cron hits this weekly (see vercel.json). Secured by CRON_SECRET:
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the env var is set.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const dateContext = buildDateContext(new Date())
    const guidance = await getGuidance(peacock.key)
    const { runId, summary } = await runAgent({
      agentKey: peacock.key,
      pass: 'author',
      trigger: 'cron',
      system: AUTHOR_SYSTEM + guidanceBlock(guidance),
      tools: peacock.tools,
      userMessage: authorInstruction(dateContext),
    })
    return NextResponse.json({ ok: true, runId, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'author run failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
