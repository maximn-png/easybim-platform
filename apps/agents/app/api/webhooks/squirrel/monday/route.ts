import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { runAgent } from '@/lib/core/agentRuntime'
import { squirrel, SETUP_SYSTEM, setupInstruction } from '@/lib/agents/squirrel'
import { getGuidance, guidanceBlock } from '@/lib/agents/squirrel/guidance'
import { BOARD_ID, COL, readQuoteItem, isReadyForSetup, isAlreadySetUp } from '@/lib/agents/squirrel/board'
import { onItemCreated, onItemRenamedOrRenumbered, onTypeChanged } from '@/lib/agents/squirrel/sync'

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
  const eventType: string = String(event.type ?? '')
  const columnId: string = String(event.columnId ?? '')

  const isOurBoard = !!itemId && (!boardId || boardId === BOARD_ID)
  if (!isOurBoard) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Ack fast; do the work in the background so Monday doesn't retry on timeout.
  after(async () => {
    try {
      // ── Deterministic sync pass (no LLM) — loop-safe, idempotent ──
      // New item: clean the name (strip Fwd:/Re:) + auto-assign the next מספר הצעה.
      if (eventType === 'create_pulse' || eventType === 'create_item') {
        await onItemCreated(itemId!)
      }
      // Name or quote-number change: keep the Drive folder + GDrive link text in sync.
      if (eventType === 'update_name' || eventType === 'change_name' || columnId === COL.quoteNumber) {
        await onItemRenamedOrRenumbered(itemId!)
      }
      // סוג פרויקט A/A.1: deterministic folder + A-PlannedWork template setup.
      // (Cheap no-op unless the item is A/A.1 with a number and not yet set up.)
      await onTypeChanged(itemId!)

      // ── Type-C agent pass (materials + scope proposal) — as before ──
      // Cheap pre-check so a random column edit doesn't burn an LLM run.
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
      console.error('[squirrel webhook] run failed:', err)
    }
  })

  return NextResponse.json({ ok: true, queued: true, itemId })
}
