// Peacock chat/author tools for Google Drive: pull project context (for "4. Project"
// case-study posts) and marketing assets. Each tool returns a string the model reads.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import {
  listProjectFiles,
  listMarketingImages,
  listMarketingFolders,
  readDriveDocText,
} from './drive'

export const listProjectFilesTool = betaZodTool({
  name: 'list_project_files',
  description:
    'List a project\'s Drive folder contents (subfolders + files with view links) by project number, e.g. "22117". Use this to gather real material for a "4. Project" case-study post. Returns NOT_FOUND if no single matching folder exists.',
  inputSchema: z.object({ projectNumber: z.string().describe('the EasyBIM project number, e.g. "22117"') }),
  run: async ({ projectNumber }) => {
    const res = await listProjectFiles(projectNumber)
    if (!res.folder) return 'NOT_FOUND (no single Projects-drive folder starts with that number)'
    return JSON.stringify({
      folder: res.folder,
      subfolders: res.subfolders,
      files: res.files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, link: f.webViewLink })),
    })
  },
})

export const readProjectDocTool = betaZodTool({
  name: 'read_project_doc',
  description:
    'Read the text of a Google Doc/Sheet from Drive by file id (get the id from list_project_files). Use to pull a project brief/scope into a post. Text-only; truncated if long.',
  inputSchema: z.object({ fileId: z.string() }),
  run: async ({ fileId }) => {
    try {
      const text = await readDriveDocText(fileId)
      return text || '(empty)'
    } catch (e) {
      return `ERROR reading file: ${(e as Error).message}`
    }
  },
})

export const listMarketingImagesTool = betaZodTool({
  name: 'list_marketing_images',
  description:
    'List image files (png/jpg) in the Marketing shared drive, optionally inside a named subfolder. Use to reference an already-created brand image for a post. Returns names + view links.',
  inputSchema: z.object({
    subfolder: z.string().optional().describe('optional folder name inside the Marketing drive'),
  }),
  run: async ({ subfolder }) => {
    const files = await listMarketingImages(subfolder)
    return JSON.stringify(files.map((f) => ({ id: f.id, name: f.name, link: f.webViewLink })))
  },
})

export const listMarketingFoldersTool = betaZodTool({
  name: 'list_marketing_folders',
  description: 'List the top-level folders of the Marketing shared drive, to discover where assets live.',
  inputSchema: z.object({}),
  run: async () => {
    const folders = await listMarketingFolders()
    return JSON.stringify(folders)
  },
})

export const driveTools = [
  listProjectFilesTool,
  readProjectDocTool,
  listMarketingImagesTool,
  listMarketingFoldersTool,
]
