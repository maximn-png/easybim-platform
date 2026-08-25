// Dog's Drive layer: find a project, then find the two documents inside it.
//
// Dog works on the folders Squirrel already builds — "<מספר הצעה> - <שם הפרויקט>"
// directly under the Price Quotes root, each with {הצעות מחיר, חוזה, חומר שהתקבל
// מהמזמין}. The agreement lands in חוזה, the quote we sent sits in הצעות מחיר.
// ROOT_FOLDER_ID is imported rather than re-declared so a future re-org moves
// both agents at once.
import * as g from '@/lib/integrations/google/client'
import { ROOT_FOLDER_ID, QUOTES_SUBFOLDER } from '@/lib/agents/squirrel/drive'

export const CONTRACT_SUBFOLDER = 'חוזה'

const DRIVE_NAME = process.env.PQ_DRIVE_NAME || 'Finance'

const MIME_PDF = 'application/pdf'
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MIME_DOC = 'application/msword'
const MIME_GDOC = 'application/vnd.google-apps.document'

/** Readable document types. Google Sheets are excluded on purpose: in הצעות מחיר
 *  the sheet is Squirrel's work-plan template copy, not the quote we sent. */
const READABLE = new Set([MIME_PDF, MIME_DOCX, MIME_DOC, MIME_GDOC])

/** An earlier review of the same agreement, not an input to a new one. */
const EXCLUDE_NAME = /הערות/

// Picking the right file is name work, not date work. Verified against the live
// drive (396 projects, 165 with a חוזה folder): a חוזה folder typically holds the
// agreement *plus* insurance annexes, NDAs, purchase orders, bank forms and loose
// scans, and a הצעות מחיר folder holds several versions of our quote plus its
// editable Google Doc, the work-plan sheet, and sometimes the client's RFQ.
// Newest-first alone lands on an insurance certificate about as often as on the
// contract — so score by name, then break ties by date. The user still sees every
// candidate in a dropdown; this only decides which one is pre-selected.

/** The document itself. "הצעה חתומה" counts: a countersigned quote often IS the contract. */
const AGREEMENT_GOOD = /הסכם|חוזה|התקשרות/
const AGREEMENT_SIGNED = /חתום|חתומה/
/** Never the agreement under review, however much the rest of the name looks like one:
 *  an NDA is literally titled "הסכם סודיות" and is often signed. Disqualifying. */
const AGREEMENT_NEVER = /סודיות|NDA/i
/** Everything else that legitimately lives in חוזה but is not the agreement. */
const AGREEMENT_BAD = /ביטוח|הזמנת רכש|הזמנה|אישור|בנק|חשבונית|קבלה|טופס|ערבות|PO\d|Jira|Untitled|סריקה|scan/i

const QUOTE_GOOD = /הצעת מחיר|הצעה/
/** The client's request for a quote — the mirror image of what we want. */
const QUOTE_BAD = /בקשה להצעת מחיר|תכנון עבודה|תוכנית עבודה|תכניות|plans/i
/** Addenda to an existing engagement rather than the quote the agreement answers. */
const QUOTE_ADDENDUM = /הגדלת|הארכת|תוספת/

export type Slot = 'agreement' | 'quote'

function score(name: string, slot: Slot, mimeType: string): number {
  let s = 0
  if (EXCLUDE_NAME.test(name)) s -= 10 // an earlier review letter
  if (slot === 'agreement') {
    if (AGREEMENT_NEVER.test(name)) s -= 10
    if (AGREEMENT_GOOD.test(name)) s += 5
    if (AGREEMENT_SIGNED.test(name)) s += 3
    if (AGREEMENT_BAD.test(name)) s -= 6
  } else {
    if (QUOTE_GOOD.test(name)) s += 5
    if (QUOTE_BAD.test(name)) s -= 6
    if (QUOTE_ADDENDUM.test(name)) s -= 2
    // The PDF is what was actually sent; the Google Doc beside it is its source.
    if (mimeType === MIME_PDF) s += 1
  }
  return s
}

export interface ProjectFolder {
  id: string
  name: string
}

/** Every project folder under the Price Quotes root, newest-looking first. */
export async function listProjects(): Promise<ProjectFolder[]> {
  const driveId = await g.getSharedDriveId(DRIVE_NAME)
  const folders = await g.listChildFolders(ROOT_FOLDER_ID, driveId)
  return folders
    .map((f) => ({ id: f.id, name: f.name }))
    .sort((a, b) => b.name.localeCompare(a.name, 'he'))
}

export interface CandidateFile {
  fileId: string
  name: string
  mimeType: string
  modifiedTime: string | null
  webViewLink?: string | null
}

export interface SlotInspection {
  /** the subfolder Dog looked in, so the UI can say where it searched */
  folder: string
  folderId: string | null
  candidates: CandidateFile[]
  /** Dog's pick — newest readable document that isn't an earlier review */
  suggestedFileId: string | null
}

export interface ProjectInspection {
  projectFolderId: string
  projectName: string
  agreement: SlotInspection
  quote: SlotInspection
}

async function inspectSlot(
  parentId: string,
  driveId: string,
  subfolder: string,
  slot: Slot
): Promise<SlotInspection> {
  const folderId = await g.findChildFolder(parentId, subfolder, driveId)
  if (!folderId) return { folder: subfolder, folderId: null, candidates: [], suggestedFileId: null }

  const files = await g.listFilesInFolder(folderId)
  // Best name first, newest first within the same score. The list order is what
  // the dropdown shows, so the likely files sit at the top either way.
  const candidates = files
    .filter((f) => READABLE.has(f.mimeType))
    .map((f) => ({
      fileId: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime ?? null,
      webViewLink: f.webViewLink ?? null,
      score: score(f.name, slot, f.mimeType),
    }))
    .sort((a, b) => b.score - a.score || (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))

  // Only pre-select when the name actually looks like the document we want.
  // A folder of nothing but insurance annexes gets no suggestion rather than a
  // confident wrong one — the user picks, or realises the file isn't there yet.
  const best = candidates[0]
  const suggested = best && best.score > 0 ? best : null

  return {
    folder: subfolder,
    folderId,
    candidates: candidates.map(({ score: _score, ...c }) => c),
    suggestedFileId: suggested?.fileId ?? null,
  }
}

/** What Dog found in one project, with its picks — shown for confirmation before any run. */
export async function inspectProject(projectFolderId: string): Promise<ProjectInspection> {
  const driveId = await g.getSharedDriveId(DRIVE_NAME)
  const meta = await g.getFileMeta(projectFolderId)
  const [agreement, quote] = await Promise.all([
    inspectSlot(projectFolderId, driveId, CONTRACT_SUBFOLDER, 'agreement'),
    inspectSlot(projectFolderId, driveId, QUOTES_SUBFOLDER, 'quote'),
  ])
  return { projectFolderId, projectName: meta.name, agreement, quote }
}

/** The contract-folder candidates of any project — used to pick a previous contract. */
export async function contractCandidates(projectFolderId: string): Promise<SlotInspection> {
  const driveId = await g.getSharedDriveId(DRIVE_NAME)
  return inspectSlot(projectFolderId, driveId, CONTRACT_SUBFOLDER, 'agreement')
}

/** A document prepared for the model: a native PDF, or extracted text. */
export type LoadedSource =
  | { kind: 'pdf'; name: string; mimeType: string; base64: string }
  | { kind: 'text'; name: string; mimeType: string; text: string }

/** Anthropic caps a request at 32MB; keep a single PDF well under that. */
const MAX_PDF_BYTES = 20 * 1024 * 1024

/**
 * Read a Drive file into something the model can consume.
 *  - PDF        → base64, sent as a native document block (best for RTL Hebrew)
 *  - Google Doc → exported as plain text
 *  - .docx/.doc → copied to a temporary Google Doc, exported as text, then trashed
 *    (Drive's converter, so no Word parser dependency in the app)
 */
export async function loadSource(fileId: string): Promise<LoadedSource> {
  const meta = await g.getFileMeta(fileId)

  if (meta.mimeType === MIME_PDF) {
    const bytes = await g.downloadDriveFile(fileId)
    if (bytes.length > MAX_PDF_BYTES) {
      throw new Error(
        `הקובץ "${meta.name}" גדול מדי (${Math.round(bytes.length / 1024 / 1024)}MB). המקסימום הוא 20MB.`
      )
    }
    return { kind: 'pdf', name: meta.name, mimeType: meta.mimeType, base64: bytes.toString('base64') }
  }

  if (meta.mimeType === MIME_GDOC) {
    const text = await g.exportGoogleFileText(fileId)
    assertHasText(text, meta.name)
    return { kind: 'text', name: meta.name, mimeType: meta.mimeType, text }
  }

  if (meta.mimeType === MIME_DOCX || meta.mimeType === MIME_DOC) {
    const text = await convertToText(fileId, meta.name)
    assertHasText(text, meta.name)
    return { kind: 'text', name: meta.name, mimeType: meta.mimeType, text }
  }

  throw new Error(`סוג הקובץ של "${meta.name}" אינו נתמך (${meta.mimeType}). נדרש PDF, Word או Google Doc.`)
}

/**
 * Previous contracts are read for a 12-word note per finding ("הופיע וטופל",
 * "נוסח מתון יותר"), not for quotation — so they go in as text, capped, rather
 * than as page images. A 30-page PDF is ~75k tokens natively and ~8k as text,
 * and three of them ride along on every comparison. Same cap the Python tool used.
 */
const MAX_PREV_CHARS = 12_000

/**
 * Load a previously signed contract. Prefers the cheap text path (Drive converts
 * and OCRs into a throwaway Google Doc); falls back to the native PDF when that
 * fails or comes back thin — Drive's OCR has size limits and gives up on some
 * scans, and a wrong "לא הופיע" note is worse than a few thousand extra tokens.
 */
export async function loadPreviousContract(fileId: string): Promise<LoadedSource> {
  const meta = await g.getFileMeta(fileId)
  const cap = (t: string) => t.slice(0, MAX_PREV_CHARS)

  if (meta.mimeType === MIME_GDOC) {
    const text = await g.exportGoogleFileText(fileId)
    assertHasText(text, meta.name)
    return { kind: 'text', name: meta.name, mimeType: meta.mimeType, text: cap(text) }
  }

  try {
    const text = await convertToText(fileId, meta.name)
    if (text.trim().length >= 500) {
      return { kind: 'text', name: meta.name, mimeType: meta.mimeType, text: cap(text) }
    }
  } catch {
    // fall through to the native path below
  }

  if (meta.mimeType === MIME_PDF) return loadSource(fileId)
  throw new Error(`לא ניתן לקרוא את ההסכם הקודם "${meta.name}".`)
}

function assertHasText(text: string, name: string) {
  if (text.trim().length < 50) {
    throw new Error(`לא ניתן לחלץ טקסט מ-"${name}". ודא שהקובץ אינו סריקה ללא שכבת טקסט.`)
  }
}

/** Convert a Word file (or a PDF, via Drive's OCR) to text through a throwaway Google Docs copy. */
async function convertToText(fileId: string, name: string): Promise<string> {
  const d = g.drive()
  const copy = await d.files.copy({
    fileId,
    requestBody: { name: `~tmp-dog-${name}`, mimeType: MIME_GDOC },
    supportsAllDrives: true,
    fields: 'id',
  })
  const tmpId = copy.data.id
  if (!tmpId) throw new Error(`המרת "${name}" ל-Google Doc נכשלה.`)
  try {
    return await g.exportGoogleFileText(tmpId)
  } finally {
    // Best effort — a leftover temp copy is noise, not a failure.
    await g.trashFile(tmpId).catch(() => {})
  }
}
