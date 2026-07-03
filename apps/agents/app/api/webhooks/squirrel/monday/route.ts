import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { runAgent } from '@/lib/core/agentRuntime'
import { squirrel, SETUP_SYSTEM, setupInstruction } from '@/lib/agents/squirrel'
import { getGuidance, guidanceBlock } from '@/lib/agents/squirrel/guidance'
import { BOARD_ID, readQuoteItem, isReadyForSetup, isAlreadySetUp } from '@/lib/agents/squirrel/board'

export const runtime = 'nodejs'
export const maxDuration = 300

// Shared-secret check via ?token=. (Hardening: switch to Monday's JWT signing-secret.)
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

  // We accept any change event on our board for an item — the setup pass itself
  // re-validates (Type-C + quote number + not-already-set) before doing anything.
  const isOurBoard = !!itemId && (!boardId || boardId === BOARD_ID)
  if (!isOurBoard) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Ack fast; run setup in the background so Monday doesn't retry on timeout.
  after(async () => {
    try {
      // Cheap pre-check so a random column edit doesn't burn an LLM run: only
      // proceed for a Type-C item with a quote number that isn't already set up.
      const item = await readQuoteItem(itemId!)
      if (!item || !isReadyForSetup(item) || isAlreadySetUp(item)) {
        return
      }

      const guidance = await getGuidance(squirrel.key)
      await runAgent({
        agentKey: squirrel.key,
        pass: 'setup',
        trigger: 'webhook',
        system: SETUP_SYSTEM + guidanceBlock(guidance),
        tools: squirrel.tools,
        userMessage: setupInstruction(itemId!),
        context: { itemId },
      })
    } catch (err) {
      console.error('[squirrel webhook] setup run failed:', err)
    }
  })

  return NextResponse.json({ ok: true, queued: true, itemId })
}
