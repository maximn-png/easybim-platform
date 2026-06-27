import { NextRequest, NextResponse } from 'next/server'

// PUBLIC endpoint (see proxy.ts) — serves a saved report's chart/screenshot PNG so
// the email body can reference it via a normal https URL. Email clients (and
// Gmail's image proxy) load these reliably, unlike cid: inline images. The
// reportId is an unguessable Mongo ObjectId.
export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await ctx.params
  const kind = req.nextUrl.searchParams.get('kind') === 'screenshot' ? 'screenshot' : 'chart'

  if (!process.env.MONGODB_URI) return new NextResponse('Not found', { status: 404 })

  try {
    const mongoose = (await import('mongoose')).default
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return new NextResponse('Not found', { status: 404 })
    }
    const { connectDB } = await import('@easybim/db')
    const Report = (await import('@/app/models/Report')).default
    await connectDB()

    const field = kind === 'screenshot' ? 'screenshotPng' : 'chartPng'
    const doc = await Report.findById(reportId).select(field).lean() as
      Record<string, { buffer?: Buffer } | Buffer | undefined> | null

    const raw = doc?.[field] as { buffer?: Buffer } | Buffer | undefined
    // Mongoose may return a Buffer or a { buffer } binary wrapper depending on lean shape.
    const buf = Buffer.isBuffer(raw) ? raw : raw?.buffer
    if (!buf || buf.length === 0) return new NextResponse('Not found', { status: 404 })

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'image/png',
        // Long cache — image bytes for a given report never change.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('[report-image]', err)
    return new NextResponse('Error', { status: 500 })
  }
}
