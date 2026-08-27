import { notFound } from 'next/navigation'
import { mockProjects } from '@/lib/mockProjects'
import ProjectConsoleClient from '@/components/ProjectConsoleClient'

export const dynamic = 'force-dynamic'

async function fetchProjectIdentity(id: string) {
  if (!process.env.MONGODB_URI) {
    const p = mockProjects.find(m => m._id === id) ?? mockProjects[0]
    return p ? { _id: p._id, projectName: p.projectName, projectNumber: p.projectNumber } : null
  }

  try {
    const { connectDB } = await import('@easybim/db')
    const Project = (await import('@/app/models/Project')).default

    await connectDB()

    const doc = await Project.findById(id).select('projectName projectNumber').lean() as
      Record<string, unknown> | null
    if (!doc) return null

    return {
      _id: String(doc._id),
      projectName: String(doc.projectName),
      projectNumber: String(doc.projectNumber),
    }
  } catch {
    return null
  }
}

export default async function BimConsolePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await fetchProjectIdentity(id)

  if (!project) notFound()

  return <ProjectConsoleClient project={project} console="bim" />
}
