import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  MAX_IMAGE_BYTES, clearPostImage, postImageResponse, storePostImage,
} from '@/lib/agents/peacock/postImage'
import type { PostImageOrigin } from '@/lib/models/PeacockImage'

export const runtime = 'nodejs'

// The cover image for one post: read it, put one there, or take it away.
//
// Covers are stored by the platform rather than only on Drive (see
// PeacockImage), so this route is what post.imageUrl points at. Behind Clerk
// like every other dashboard route: a cover is unpublished marketing material
// until Maxim posts it.

// GET — the bytes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  return postImageResponse(postId, req.headers.get('if-none-match'))
}

/**
 * POST — attach an image to this post (multipart, field "file").
 *
 * Both directions land here: a BIM Composer render posted straight from its
 * canvas, and a file chosen in the post drawer. `origin` distinguishes them and
 * `projectNumber` lets a composer render fill in the post→project link the plan
 * has never had.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded (field "file")' }, { status: 400 })
  }
  // Reject on the declared size before reading the body into memory.
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB` },
      { status: 413 }
    )
  }

  const originRaw = String(form?.get('origin') ?? 'upload')
  const origin: PostImageOrigin = originRaw === 'composer' ? 'composer' : 'upload'
  const projectNumber = String(form?.get('projectNumber') ?? '').trim() || undefined

  try {
    const { imageUrl } = await storePostImage({
      postId,
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || 'image/png',
      origin,
      projectNumber,
      fileName: file.name || undefined,
    })
    return NextResponse.json({ imageUrl }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not store the image'
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    // Everything storePostImage rejects (empty, oversized, wrong type) is the
    // caller's problem, not a server fault.
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// DELETE — remove the cover, so a wrong image can be taken off a post.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  await clearPostImage(postId)
  return NextResponse.json({ ok: true })
}
