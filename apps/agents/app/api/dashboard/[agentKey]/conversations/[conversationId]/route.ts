import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import AgentConversation from '@/lib/models/AgentConversation'
import AgentMessage from '@/lib/models/AgentMessage'

export const runtime = 'nodejs'

// Delete a conversation and its messages. Only the owner may delete;
// the shared archive cannot be deleted from the UI.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentKey: string; conversationId: string }> }
) {
  const { agentKey, conversationId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const convo = await AgentConversation.findOne({ _id: conversationId, agentKey })
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (convo.shared) return NextResponse.json({ error: 'Shared archive cannot be deleted' }, { status: 403 })
  if (convo.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await AgentMessage.deleteMany({ conversationId: convo._id })
  await convo.deleteOne()
  return NextResponse.json({ ok: true })
}
