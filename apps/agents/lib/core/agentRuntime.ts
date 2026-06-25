import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun, { AgentRunTrigger } from '@/lib/models/AgentRun'
import AgentMessage from '@/lib/models/AgentMessage'
import { AgentTool } from './types'

const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 16000

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic()
}

export interface RunAgentArgs {
  agentKey: string
  pass: string
  trigger: AgentRunTrigger
  system: string
  tools: AgentTool[]
  userMessage: string
  context?: Record<string, unknown>
}

export interface RunAgentResult {
  runId: string
  summary: string
}

/**
 * Run one agent pass to completion via the Anthropic tool runner, persisting
 * an AgentRun + the final assistant message. The tools perform the side effects
 * (Monday writes, image gen, etc.).
 */
export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  await connectDB()

  const run = await AgentRun.create({
    agentKey: args.agentKey,
    pass: args.pass,
    trigger: args.trigger,
    status: 'running',
    context: args.context,
    startedAt: new Date(),
  })

  await AgentMessage.create({
    agentKey: args.agentKey,
    runId: run._id,
    role: 'user',
    content: args.userMessage,
  })

  try {
    const final = await client().beta.messages.toolRunner({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: args.system,
      tools: args.tools,
      messages: [{ role: 'user', content: args.userMessage }],
    })

    const summary = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    await AgentMessage.create({
      agentKey: args.agentKey,
      runId: run._id,
      role: 'assistant',
      content: summary,
    })

    run.status = 'done'
    run.summary = summary.slice(0, 2000)
    run.inputTokens = final.usage?.input_tokens
    run.outputTokens = final.usage?.output_tokens
    run.finishedAt = new Date()
    await run.save()

    return { runId: String(run._id), summary }
  } catch (err) {
    run.status = 'error'
    run.error = err instanceof Error ? err.message : 'Unknown error'
    run.finishedAt = new Date()
    await run.save()
    throw err
  }
}
