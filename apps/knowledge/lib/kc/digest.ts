import type { Types } from 'mongoose'
import { getDriveFileMeta, downloadDriveFile } from '@/lib/integrations/googleDrive'
import { digestGoogleDoc } from './digestProviders/googleDocs'
import { digestDocxBuffer } from './digestProviders/docx'

export * from './blockContract'
// Re-exported so existing callers (the batch script, tests) can still import
// digestGoogleDoc directly from here without knowing about the provider split.
export { digestGoogleDoc }

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** The one entry point every caller should use: looks up the source file's
 * real Drive mimeType and dispatches to whichever provider under
 * ./digestProviders/ can read it (see ./digestProviders/googleDocs.ts and
 * ./digestProviders/docx.ts). `fallbackTitle` is used by providers (like
 * .docx) that have no equivalent of the Docs API's own doc.title — pass the
 * Monday item's name / the existing record's title. Used by both the batch
 * script and the real POST /api/documents/:sourceId/import route, so there
 * is exactly one dispatch implementation, not two that can drift apart. */
export async function digestBySourceId(
  sourceId: string,
  documentId: Types.ObjectId,
  fallbackTitle: string
) {
  let meta
  try {
    meta = await getDriveFileMeta(sourceId)
  } catch (err) {
    return { ok: false as const, errorMessage: (err as Error).message }
  }

  if (meta.mimeType === GOOGLE_DOC_MIME) {
    return digestGoogleDoc(sourceId, documentId)
  }
  if (meta.mimeType === DOCX_MIME) {
    const buffer = await downloadDriveFile(sourceId)
    return digestDocxBuffer(buffer, documentId, fallbackTitle || meta.name)
  }
  return { ok: false as const, errorMessage: `Unsupported file type for digest: ${meta.mimeType || 'unknown'}` }
}
