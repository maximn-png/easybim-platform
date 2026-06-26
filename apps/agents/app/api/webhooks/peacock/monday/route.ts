import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { runAgent } from '@/lib/core/agentRuntime'
import { peacock, WATCHER_SYSTEM, watcherInstruction } from '@/lib/agents/peacock'
import { getGuidance, guidanceBlock } from '@/lib/agents/peacock/guidance'
import { BOARD_ID, COL } from '@/lib/agents/peacock/board'

export const runtime = 'nodejs'
export const maxDuration = 300

// Signals we react to (set the Monday automation to fire on these status labels).
const WATCH_SIGNALS = new Set(['Approved', 'Revise'])

// Shared-secret check via ?token=. (Hardening: switch to Monday's JWT signing-secret
// verification on the Authorization header.)
function authorized(req: NextRequest): boolean {
  const secret = process.env.MONDAY_WEBHOOK_SECRET
  if (!secret) return false
  return new URL(req.url).searchParams.get('token') === secret
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  // Monday handshake: echo the challenge on webhook creation.
  if (body?.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }

  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const event = body?.event ?? {}
  const itemId: string | undefined = event.pulseId ? String(event.pulseId) : undefined
  const boardId: string | undefined = event.boardId ? String(event.boardId) : undefined
  const columnId: string | undefined = event.columnId
  const label: string | undefined = event?.value?.label?.text ?? event?.value?.label

  const isOurStatusChange =
    !!itemId &&
    (!boardId || boardId === BOARD_ID) &&
    (!columnId || columnId === COL.status) &&
    !!label &&
    WATCH_SIGNALS.has(label)

  if (!isOurStatusChange) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Ack fast; run the watcher in the background so Monday doesn't retry on timeout.
  after(async () => {
    try {
      const guidance = await getGuidance(peacock.key)
      await runAgent({
        agentKey: peacock.key,
        pass: 'watcher',
        trigger: 'webhook',
        system: WATCHER_SYSTEM + guidanceBlock(guidance),
        tools: peacock.tools,
        userMessage: watcherInstruction(itemId!, label!),
        context: { itemId, signal: label },
      })
    } catch (err) {
      console.error('[peacock webhook] watcher run failed:', err)
    }
  })

  return NextResponse.json({ ok: true, queued: true, itemId, signal: label })
}
