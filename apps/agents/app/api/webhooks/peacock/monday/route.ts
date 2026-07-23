import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// DEPRECATED: Peacock no longer uses Monday. Posts are planned/reviewed in the
// web dashboard (local content-plan store). This endpoint is kept only so any
// still-configured Monday automation gets a clean 200 instead of erroring;
// it performs no work. Remove the Monday automation, then delete this route.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (body?.challenge) return NextResponse.json({ challenge: body.challenge })
  return NextResponse.json({ ok: true, ignored: true, deprecated: true })
}
