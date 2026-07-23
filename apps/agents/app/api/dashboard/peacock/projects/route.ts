import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { listProjectStatus } from '@/lib/agents/peacock/projects'

export const runtime = 'nodejs'

// GET /api/dashboard/peacock/projects — EPM projects merged with marketing flags.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const projects = await listProjectStatus()
  return NextResponse.json({ projects })
}
