// Peacock ↔ Google Drive: read project folders (for "Project" case-study posts)
// and the Marketing shared drive (for brand assets / generated images).
// Reuses the shared, service-account Google client (lib/integrations/google/client.ts)
// that Squirrel already uses — no new auth.

import {
  getSharedDriveId,
  listChildFolders,
  listFilesInFolder,
  exportGoogleFileText,
  folderUrl,
  type DriveFile,
} from '@/lib/integrations/google/client'

const PROJECTS_DRIVE = 'Projects'
const MARKETING_DRIVE = 'Marketing'

// Project folders are named "<number>_<name>" / "<number> <name>" etc. Require
// the name to START with the number followed by a non-digit, so "22117" matches
// "22117_Foo" but not "221170_Bar". (Same rule as apps/epm driveService.)
function isProjectFolder(name: string, num: string): boolean {
  if (!name.startsWith(num)) return false
  const after = name[num.length]
  return after === undefined || after < '0' || after > '9'
}

export interface ProjectFolder {
  id: string
  name: string
  url: string
}

/** Find the single Projects-drive folder whose name starts with the project number. */
export async function findProjectFolder(projectNumber: string): Promise<ProjectFolder | null> {
  const driveId = await getSharedDriveId(PROJECTS_DRIVE)
  const folders = await listChildFolders(driveId, driveId)
  const matches = folders.filter((f) => isProjectFolder(f.name, projectNumber))
  if (matches.length !== 1) return null // 0 or ambiguous → caller reports not-found
  return { id: matches[0].id, name: matches[0].name, url: folderUrl(matches[0].id) }
}

export interface ProjectContents {
  folder: ProjectFolder | null
  subfolders: { id: string; name: string; url: string }[]
  files: DriveFile[]
}

/** List a project's top-level subfolders + files (by project number). */
export async function listProjectFiles(projectNumber: string): Promise<ProjectContents> {
  const driveId = await getSharedDriveId(PROJECTS_DRIVE)
  const folder = await findProjectFolder(projectNumber)
  if (!folder) return { folder: null, subfolders: [], files: [] }
  const [subfolders, files] = await Promise.all([
    listChildFolders(folder.id, driveId),
    listFilesInFolder(folder.id),
  ])
  return {
    folder,
    subfolders: subfolders.map((f) => ({ id: f.id, name: f.name, url: folderUrl(f.id) })),
    files,
  }
}

/** List image files in the Marketing shared drive (optionally inside a named subfolder). */
export async function listMarketingImages(subfolderName?: string): Promise<DriveFile[]> {
  const driveId = await getSharedDriveId(MARKETING_DRIVE)
  let parent = driveId
  if (subfolderName) {
    const folders = await listChildFolders(driveId, driveId)
    const hit = folders.find((f) => f.name === subfolderName)
    if (!hit) return []
    parent = hit.id
  }
  const [png, jpg] = await Promise.all([
    listFilesInFolder(parent, 'image/png'),
    listFilesInFolder(parent, 'image/jpeg'),
  ])
  return [...png, ...jpg]
}

/** List the top-level folders of the Marketing shared drive (to discover asset folders). */
export async function listMarketingFolders(): Promise<{ id: string; name: string; url: string }[]> {
  const driveId = await getSharedDriveId(MARKETING_DRIVE)
  const folders = await listChildFolders(driveId, driveId)
  return folders.map((f) => ({ id: f.id, name: f.name, url: folderUrl(f.id) }))
}

/** Export a Google Doc/Sheet's text (for reading a project brief into a post). */
export async function readDriveDocText(fileId: string, maxChars = 8000): Promise<string> {
  const text = await exportGoogleFileText(fileId)
  return text.length > maxChars ? text.slice(0, maxChars) + '\n…[truncated]' : text
}
