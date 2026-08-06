import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import Suggestion from '@/lib/models/Suggestion'
import DocumentModel, { type ContractBlock } from '@/lib/models/Document'
import LiveTreeNode from '@/lib/models/LiveTreeNode'
import Notification from '@/lib/models/Notification'
import { hydrateName, isTeamLead } from '@/lib/kc/authHelpers'
import { reindexDocument } from '@/lib/kc/embeddings'

function today() {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
}

// kc-suggest.js's bIdx/tIdx are DOM-position indices (bIdx even flattens
// list items in) that drift the moment the document changes underneath a
// still-pending suggestion — matching by the ORIGINAL TEXT itself is more
// robust than trusting a stale positional index across an async review gap.
function findMatchingBlockIndex(
  blocks: ContractBlock[],
  original?: string
): { blockIdx: number; itemIdx: number } {
  const target = (original || '').trim()
  if (!target) return { blockIdx: -1, itemIdx: -1 }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (typeof b.txt === 'string' && b.txt.trim() === target) return { blockIdx: i, itemIdx: -1 }
    if (Array.isArray(b.items)) {
      const j = b.items.findIndex((it) => (it || '').trim() === target)
      if (j !== -1) return { blockIdx: i, itemIdx: j }
    }
  }
  return { blockIdx: -1, itemIdx: -1 }
}

// Inserts right after the last block of the section named by `anchor`
// (before the next heading), matching where kc-suggest.js's "Add after"
// card visually sat in the open document. Falls back to the end of the
// document if the anchor is missing or no longer resolves.
function insertAfterAnchor(blocks: ContractBlock[], anchor: string | undefined, newBlock: ContractBlock) {
  if (!anchor) {
    blocks.push(newBlock)
    return
  }
  const hIdx = blocks.findIndex((b) => b.t === 'h' && b.anchor === anchor)
  if (hIdx === -1) {
    blocks.push(newBlock)
    return
  }
  let insertAt = hIdx + 1
  while (insertAt < blocks.length && blocks[insertAt].t !== 'h') insertAt++
  blocks.splice(insertAt, 0, newBlock)
}

// POST /api/kc/suggestions/:id/resolve — the only real path from "pending"
// to approved/rejected. Team-lead-only, checked server-side against the
// same resolveKnowledgeRole used everywhere else — the client-side gate on
// the review console is a UX convenience, not the actual boundary.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isTeamLead(userId, sessionClaims))) {
    return NextResponse.json({ error: 'Team Lead access required' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }
  const overrideTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : undefined
  const overrideBody = typeof body.body === 'string' ? body.body : undefined
  // 'add' suggestions never carry an anchor at submit time — kc-suggest.js
  // only computes it client-side, at the moment of approval, from whichever
  // DOM node is currently open (KC.applyProposalDOM's sectionAnchorOf) — the
  // client forwards that freshly-computed value here.
  const overrideAnchor = typeof body.anchor === 'string' ? body.anchor : undefined

  await connectDB()
  const sugg = await Suggestion.findById(id)
  if (!sugg || sugg.status !== 'pending') {
    return NextResponse.json({ error: 'Suggestion not found or already resolved' }, { status: 404 })
  }

  const resolverName = await hydrateName(userId)
  let notifyMessage: string
  let reindexSourceId: string | undefined

  if (action === 'reject') {
    notifyMessage = `Your suggestion "${overrideTitle || sugg.title}" was declined by ${resolverName}.`
  } else if (sugg.type === 'new') {
    const title = overrideTitle || sugg.title
    const content = overrideBody ?? sugg.content ?? ''
    const sourceDocId = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    await DocumentModel.create({
      sourceDocId,
      workspaceId: 'ws' + sugg.ws,
      title,
      status: 'ready',
      version: 1,
      blocks: [{ t: 'p', txt: content }],
      toc: [],
      links: [],
      versionHistory: [{ v: '1', date: today(), who: sugg.authorName }],
      digestIssues: [],
      contractVersion: 1,
      importedAt: new Date(),
    })
    await LiveTreeNode.create({
      wsKey: 'ws' + sugg.ws,
      parentPath: sugg.path.slice(1),
      name: title,
      status: 'done',
      sourceId: sourceDocId,
      createdByUserId: sugg.authorUserId,
    })
    notifyMessage = `Your topic "${title}" was approved and published to the Knowledge Center by ${resolverName}.`
    reindexSourceId = sourceDocId
  } else {
    if (!sugg.sourceId) {
      return NextResponse.json(
        { error: 'This suggestion has no target document (missing sourceId)' },
        { status: 400 }
      )
    }
    const doc = await DocumentModel.findOne({ sourceDocId: sugg.sourceId })
    if (!doc) {
      return NextResponse.json({ error: 'Target document not found' }, { status: 404 })
    }
    if (sugg.type === 'edit') {
      const proposed = overrideBody ?? sugg.proposed ?? ''
      const { blockIdx, itemIdx } = findMatchingBlockIndex(doc.blocks, sugg.original)
      if (blockIdx === -1) {
        return NextResponse.json(
          { error: 'Original text no longer found in the document — it may have changed since this was proposed' },
          { status: 409 }
        )
      }
      if (itemIdx === -1) doc.blocks[blockIdx].txt = proposed
      else (doc.blocks[blockIdx].items as string[])[itemIdx] = proposed
    } else {
      const content = overrideBody ?? sugg.content ?? ''
      insertAfterAnchor(doc.blocks, overrideAnchor ?? sugg.anchor, { t: 'p', txt: content })
    }
    doc.markModified('blocks')
    doc.version += 1
    doc.versionHistory.push({ v: String(doc.version), date: today(), who: sugg.authorName })
    await doc.save()
    notifyMessage = `Your ${sugg.type === 'add' ? 'addition' : 'edit'} to "${sugg.title}" was approved by ${resolverName}.`
    reindexSourceId = sugg.sourceId
  }

  sugg.status = action === 'approve' ? 'approved' : 'rejected'
  sugg.resolvedAt = new Date()
  sugg.resolvedByUserId = userId
  sugg.resolvedByName = resolverName
  await sugg.save()

  // Best-effort — a stale search index is recoverable, a failed approval isn't.
  if (reindexSourceId) {
    await reindexDocument(reindexSourceId).catch((err) => console.error('[resolve] reindex failed:', err))
  }

  await Notification.create({ userId: sugg.authorUserId, message: notifyMessage })

  return NextResponse.json({ ok: true })
}
