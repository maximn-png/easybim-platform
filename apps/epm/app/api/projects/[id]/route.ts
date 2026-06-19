import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

function isAdmin(userId: string): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return adminIds.includes(userId)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId || !isAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    const allowedFields: Record<string, unknown> = {}
    if (body.externalIds !== undefined) allowedFields.externalIds = body.externalIds
    if (body.displayOrder !== undefined) allowedFields.displayOrder = body.displayOrder
    if (body.isActive !== undefined) allowedFields.isActive = body.isActive
    if (body.projectName !== undefined) allowedFields.projectName = body.projectName

    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const updated = await Project.findByIdAndUpdate(
      id,
      { $set: allowedFields },
      { new: true, runValidators: true }
    ).lean()

    if (!updated) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ project: updated })
  } catch (err) {
    console.error('[PATCH /api/projects/:id]', err)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}
