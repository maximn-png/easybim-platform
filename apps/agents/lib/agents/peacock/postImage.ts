import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongoose'
import PeacockImage, { PostImageOrigin } from '@/lib/models/PeacockImage'
import PeacockPost from '@/lib/models/PeacockPost'
import { AGENT_KEY } from './posts'

// Serving a generated post cover. Split out of the route handler so the same
// code can be exercised without a Clerk session.

/**
 * Coerce whatever the driver handed back into real bytes.
 *
 * A hydrated mongoose doc casts a Buffer path for us, but this stays defensive
 * on purpose: read the same row with `.lean()` and the cast is skipped, so the
 * field arrives as a BSON `Binary` whose bytes live on `.buffer`. Passing that
 * straight to `Buffer.from` yields an empty body and serves a blank image, and
 * nothing about the failure points at the cause.
 */
export function toBytes(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  // BSON Binary — .buffer holds the payload.
  if (data && typeof data === 'object' && 'buffer' in data) {
    const inner = (data as { buffer: unknown }).buffer
    if (Buffer.isBuffer(inner)) return inner
    if (inner instanceof ArrayBuffer || ArrayBuffer.isView(inner)) return Buffer.from(inner as ArrayBuffer)
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return Buffer.from(data as ArrayBuffer)
  throw new Error(`Stored image bytes are not readable (got ${Object.prototype.toString.call(data)})`)
}

/** Images larger than this are refused — a LinkedIn cover has no business being bigger. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp']

export interface StorePostImageInput {
  postId: string
  bytes: Buffer
  mimeType: string
  origin: PostImageOrigin
  /** Composer renders carry the project their model came from. */
  projectNumber?: string
  fileName?: string
  /** Generation only: the post text the cover was made from. */
  prompt?: string
}

/**
 * Store a cover for a post and point the post at it.
 *
 * Every route into a cover funnels through here — Peacock's generator, a BIM
 * Composer render, a hand-picked file — so they cannot drift on the parts that
 * are easy to get wrong: replacing rather than duplicating the row, and moving
 * the ?v= stamp so a new image is not hidden behind a cached copy of the old one.
 *
 * Returns the URL to put in front of the user.
 */
export async function storePostImage(input: StorePostImageInput): Promise<{ imageUrl: string }> {
  const { postId, bytes, mimeType, origin } = input
  if (bytes.length === 0) throw new Error('Image is empty')
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image is ${(bytes.length / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB`)
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    throw new Error(`Unsupported image type "${mimeType}" (use PNG, JPEG or WebP)`)
  }

  await connectDB()
  const post = await PeacockPost.findById(postId)
  if (!post) throw new Error('NOT_FOUND')

  await PeacockImage.findOneAndUpdate(
    { postId },
    {
      postId,
      data: bytes,
      mimeType,
      bytes: bytes.length,
      origin,
      projectNumber: input.projectNumber,
      fileName: input.fileName,
      prompt: input.prompt,
      // A replacement image has not been archived anywhere yet.
      driveUrl: undefined,
    },
    { upsert: true, new: true }
  )

  const imageUrl = `/api/dashboard/${AGENT_KEY}/posts/${postId}/image?v=${Date.now()}`
  post.imageUrl = imageUrl
  // A composer render is the one case that also tells us which project the post
  // is about — the field the plan has never had filled in. Only set it when the
  // post has no project yet, so attaching an image never silently reassigns one.
  if (input.projectNumber && !post.projectNumber) {
    post.projectNumber = input.projectNumber
  }
  await post.save()

  return { imageUrl }
}

/** Detach a cover from a post: drop the bytes and clear the link. */
export async function clearPostImage(postId: string): Promise<void> {
  await connectDB()
  await PeacockImage.deleteOne({ postId })
  // projectNumber is left alone on purpose — removing the wrong picture should
  // not also forget which project the post is about.
  await PeacockPost.updateOne({ _id: postId }, { $unset: { imageUrl: '' } })
}

/** Note that a cover also reached the Drive archive. Best-effort; never throws. */
export async function recordDriveArchive(postId: string, driveUrl: string): Promise<void> {
  await connectDB()
  await PeacockImage.updateOne({ postId }, { $set: { driveUrl } })
}

/** The cover for one post as an image response, or a 404 when none was generated. */
export async function postImageResponse(postId: string, ifNoneMatch?: string | null): Promise<NextResponse> {
  await connectDB()
  // Deliberately NOT .lean(): the hydrated doc casts `data` to a Buffer, which
  // is the whole reason toBytes has an easy path to take.
  const img = await PeacockImage.findOne({ postId })
  if (!img) return NextResponse.json({ error: 'No generated image for this post' }, { status: 404 })

  let body: Buffer
  try {
    body = toBytes(img.data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
  if (body.length === 0) {
    return NextResponse.json({ error: 'Stored image is empty' }, { status: 500 })
  }

  // Identity of these exact bytes: regenerating replaces the row and moves
  // updatedAt, so the tag changes precisely when the image does.
  const etag = `"${postId}-${new Date(img.updatedAt).getTime()}-${body.length}"`

  // Revalidate on every load rather than caching hard.
  //
  // This started as `immutable`, which was wrong in a way worth remembering: a
  // cover is addressed by a URL whose ?v= stamp only changes when the image is
  // regenerated, so one bad response — an empty body from the Binary/Buffer bug
  // above — got pinned in the browser for a year, and no amount of reloading the
  // dashboard could dislodge it. `no-cache` still costs almost nothing: the
  // browser sends If-None-Match and normally gets a 304 with no body, but a
  // wrong cached copy now heals itself on the next load.
  const headers = {
    'Content-Type': img.mimeType || 'image/png',
    'Cache-Control': 'private, no-cache',
    ETag: etag,
  }

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers })
  }

  // Uint8Array rather than the Buffer itself: Buffer is a Node type and the Web
  // Response body expects a plain view. Content-Length is left to the runtime —
  // setting it by hand only creates a chance to disagree with the real body.
  return new NextResponse(new Uint8Array(body), { headers })
}
