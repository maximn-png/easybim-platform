import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAgent } from '@/lib/core/registry'
import { listConversations } from '@/lib/core/conversations'

export const runtime = 'nodejs'

// List the signed-in user's conversations for this agent (+ the shared archive).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  if (!getAgent(agentKey)) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const conversations = await listConversations(agentKey, userId)
  return NextResponse.json({ conversations })
}
