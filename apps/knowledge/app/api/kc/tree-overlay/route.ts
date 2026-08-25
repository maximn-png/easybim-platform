import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectDB } from '@/lib/db/mongoose'
import LiveTreeNode from '@/lib/models/LiveTreeNode'
import MondayTreeItem from '@/lib/models/MondayTreeItem'

// GET /api/kc/tree-overlay — everything that keeps window.KC_TREE (the
// static, build-time snapshot kc-data.js sets) honest at runtime:
//   - `nodes`: topics a team lead approved from a 'new'-type suggestion —
//     additive, grafted on if not already present (kc-api.js's
//     graftTreeOverlay pushes these onto whatever's already at their path).
//   - `replaceSections`: sections mirrored live from Monday (currently just
//     ws1's Revit>Docs group, see lib/kc/mondaySync.ts's daily cron sync) —
//     a full snapshot per section, so adds/renames/removals in Monday are
//     just "whatever MondayTreeItem currently holds", applied as a wholesale
//     replace of that section's children rather than a diff.
// Shared/global (not per-user) — every signed-in user sees the same tree;
// grafted client-side before kc-app.js ever renders, so changes show up
// without a code deploy (kc-data.js's static file can't be rewritten on a
// live deployment — read-only filesystem at runtime).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const [liveTreeNodes, mondayItems] = await Promise.all([
    LiveTreeNode.find({}).lean(),
    MondayTreeItem.find({}).lean(),
  ])

  const sections = new Map<string, { wsKey: string; parentPath: string[]; children: Array<{ n: string; s: string; doc?: string }> }>()
  mondayItems.forEach((m) => {
    const key = m.wsKey + '::' + m.parentPath.join('›')
    let section = sections.get(key)
    if (!section) {
      section = { wsKey: m.wsKey, parentPath: m.parentPath, children: [] }
      sections.set(key, section)
    }
    const child: { n: string; s: string; doc?: string } = { n: m.name, s: m.status }
    if (m.sourceId) child.doc = m.sourceId
    section.children.push(child)
  })

  return NextResponse.json({
    nodes: liveTreeNodes.map((n) => ({
      wsKey: n.wsKey,
      parentPath: n.parentPath,
      name: n.name,
      status: n.status,
      sourceId: n.sourceId,
    })),
    replaceSections: Array.from(sections.values()),
  })
}
