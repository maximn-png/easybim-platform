import { NextResponse } from 'next/server'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

export async function GET() {
  try {
    const dir = path.join(process.cwd(), 'public', 'team-photos')
    const files = await readdir(dir)

    const photos = files
      .filter(f => SUPPORTED.has(path.extname(f).toLowerCase()))
      .map(f => `/team-photos/${encodeURIComponent(f)}`)
      .sort(() => Math.random() - 0.5)
      .slice(0, 10)

    return NextResponse.json({ photos })
  } catch (err: any) {
    console.error('[/api/photos]', err?.message)
    return NextResponse.json({ photos: [] }, { status: 500 })
  }
}
