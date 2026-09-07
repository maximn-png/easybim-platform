import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/core/agentRuntime'
import {
  peacock, authorSystem, authorInstruction, buildDateContext, getContentPlan, isAutopilotOff,
} from '@/lib/agents/peacock'
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
    // The dashboard's Content Plan governs this pass. At 0 posts/week the run
    // still happens, but only to pick up posts Maxim bounced back with
    // `revise` — it will not propose content of its own.
    const [plan, guidance] = await Promise.all([getContentPlan(), getGuidance(peacock.key)])
    const dateContext = buildDateContext(new Date(), plan.postsPerWeek)
    const { runId, summary } = await runAgent({
      agentKey: peacock.key,
      pass: 'author',
      trigger: 'cron',
      system: authorSystem(plan) + guidanceBlock(guidance),
      userMessage: authorInstruction(dateContext, plan),
      tools: peacock.tools,
    })
    return NextResponse.json({
      ok: true,
      runId,
      summary,
      plan,
      autopilot: isAutopilotOff(plan) ? 'off (revise-only)' : `${plan.postsPerWeek}/week`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'author run failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
