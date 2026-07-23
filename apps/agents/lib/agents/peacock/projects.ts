// Project Status data: EPM's synced projects (read-only, cross-DB on the same
// cluster) merged with Peacock's own marketing flags.
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db/mongoose'
import ProjectFlag from '@/lib/models/ProjectFlag'

// EPM stores projects in a sibling database on the same Atlas cluster. We reuse
// the existing agents connection and switch DBs — no second pool, no shared secret.
const EPM_DB = 'easybim-epm'
const EPM_PROJECTS = 'projects'

export interface ProjectStatusRow {
  projectNumber: string
  projectName: string
  status: string | null
  mondayUrl: string | null
  driveUrl: string | null
  publishedToLinkedIn: boolean
  inPortfolio: boolean
}

interface EpmProjectDoc {
  projectName?: string
  projectNumber?: string
  displayOrder?: number
  snapshot?: { status?: string | null }
  externalIds?: { mondayBoardUrl?: string; mainBoardUrl?: string; driveFolderUrl?: string }
}

export async function listProjectStatus(): Promise<ProjectStatusRow[]> {
  await connectDB()
  const epm = mongoose.connection.useDb(EPM_DB, { useCache: true })
  const docs = (await epm
    .collection(EPM_PROJECTS)
    .find(
      { isActive: true },
      {
        projection: {
          projectName: 1,
          projectNumber: 1,
          displayOrder: 1,
          'snapshot.status': 1,
          'externalIds.mondayBoardUrl': 1,
          'externalIds.mainBoardUrl': 1,
          'externalIds.driveFolderUrl': 1,
        },
      }
    )
    .sort({ displayOrder: 1, projectName: 1 })
    .toArray()) as EpmProjectDoc[]

  const flags = await ProjectFlag.find({}).lean()
  const flagMap = new Map(flags.map((f) => [f.projectNumber, f]))

  return docs.map((d) => {
    const f = flagMap.get(String(d.projectNumber))
    const ext = d.externalIds ?? {}
    return {
      projectNumber: String(d.projectNumber ?? ''),
      projectName: String(d.projectName ?? ''),
      status: d.snapshot?.status ?? null,
      mondayUrl: ext.mainBoardUrl ?? ext.mondayBoardUrl ?? null,
      driveUrl: ext.driveFolderUrl ?? null,
      publishedToLinkedIn: !!f?.publishedToLinkedIn,
      inPortfolio: !!f?.inPortfolio,
    }
  })
}

export async function setProjectFlag(
  projectNumber: string,
  patch: { publishedToLinkedIn?: boolean; inPortfolio?: boolean },
  userId?: string
): Promise<{ publishedToLinkedIn: boolean; inPortfolio: boolean }> {
  await connectDB()
  const set: Record<string, unknown> = { updatedBy: userId }
  if (typeof patch.publishedToLinkedIn === 'boolean') set.publishedToLinkedIn = patch.publishedToLinkedIn
  if (typeof patch.inPortfolio === 'boolean') set.inPortfolio = patch.inPortfolio

  const doc = await ProjectFlag.findOneAndUpdate(
    { projectNumber },
    { $set: set, $setOnInsert: { projectNumber } },
    { new: true, upsert: true }
  ).lean()

  return {
    publishedToLinkedIn: !!doc?.publishedToLinkedIn,
    inPortfolio: !!doc?.inPortfolio,
  }
}
