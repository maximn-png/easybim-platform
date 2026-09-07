import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveViewerHub } from '@/lib/services/apsHubs'
import { getApsUserToken } from '@/lib/services/apsUserToken'
import { publishModel, getPublishJob } from '@/lib/services/apsPublish'

// Syncguard Phase 0 — server-side "Publish Latest" for a coordination model.
// No Revit, no workstation: this is the step of the pipeline that makes ACC and
// Forma serve the model's newest committed state (docs/SYNCGUARD_PLAN.md).
//
// POST → publish.  GET → is a publish already running (for poll-after-publish).
//
// Uses the caller's 3-legged token, not the hub's 2-legged one: the commands
// endpoint rejects service tokens outright, and publishing as the real user is
// what we want in ACC's history anyway. No token → { needsApsAuth: true },
// matching app/api/projects/[id]/issues/route.ts.

async function context(id: string) {
  const { connectDB } = await import('@easybim/db')
  const Project = (await import('@/app/models/Project')).default
  await connectDB()

  const doc = await Project.findById(id).select('externalIds').lean() as Record<string, unknown> | null
  if (!doc) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  const ext = (doc.externalIds ?? {}) as Record<string, unknown>
  const accProjectId = ext.accProjectId as string | undefined
  const hub = resolveViewerHub(ext.accHubId as string | undefined, ext.accExternalHub as boolean | undefined)
  if (!hub || !accProjectId) return { error: NextResponse.json({ unsupported: true }) }

  const token = await getApsUserToken(hub)
  if (!token) return { error: NextResponse.json({ needsApsAuth: true, hub: hub.key }) }

  return { accProjectId, token }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ unsupported: true })

  const { itemId } = await req.json().catch(() => ({})) as { itemId?: string }
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })

  const ctx = await context(id)
  if ('error' in ctx) return ctx.error

  try {
    const result = await publishModel(ctx.accProjectId!, itemId, ctx.token!)
    // 'unauthorized' here means the token is fine but this user can't publish
    // this project — a permissions answer, not an auth prompt.
    return NextResponse.json(result, { status: result.state === 'failed' ? 502 : 200 })
  } catch (err) {
    console.error('[POST /api/projects/[id]/syncguard/publish]', err)
    return NextResponse.json({ state: 'failed', detail: 'Publish request failed' }, { status: 502 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!process.env.MONGODB_URI) return NextResponse.json({ unsupported: true })

  const itemId = req.nextUrl.searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })

  const ctx = await context(id)
  if ('error' in ctx) return ctx.error

  try {
    const job = await getPublishJob(ctx.accProjectId!, itemId, ctx.token!)
    return NextResponse.json({ running: job?.running ?? false, status: job?.status ?? 'unknown' })
  } catch (err) {
    console.error('[GET /api/projects/[id]/syncguard/publish]', err)
    return NextResponse.json({ error: 'Publish status failed' }, { status: 502 })
  }
}
