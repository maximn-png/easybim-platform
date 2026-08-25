// "Which contracts have we already signed with this client?"
//
// The project folder name carries the quote number ("205 - בורוכוב 14 רעננה"),
// Squirrel's QuoteRecord index carries the client for that quote number, and the
// client's other quotes carry their own Drive folders. So the chain is:
//   folder name → quote number → client → sibling projects → their חוזה folder.
//
// ⚠️ Measured on the live index (458 records): 350 have a client and 432 a folder
// link, and 50 clients have more than one project — so this finds something for
// repeat clients and legitimately nothing for one-off ones. It is a suggestion
// layer only: the picker always allows choosing a contract from any project.
import { connectDB } from '@/lib/db/mongoose'
import QuoteRecord from '@/lib/models/QuoteRecord'
import { parseFolderId } from '@/lib/integrations/google/client'
import { contractCandidates } from './drive'

/** Bound the Drive round-trips for a client like אמות השקעות (28 projects). */
const MAX_SIBLINGS = 14

export interface PreviousContractOption {
  fileId: string
  name: string
  mimeType: string
  modifiedTime: string | null
  /** "205 - בורוכוב 14 רעננה" — what the comparison column is labelled with */
  projectLabel: string
  projectFolderId: string
}

export interface PreviousContractSuggestions {
  /** null when the project's quote number isn't in the index, or has no client on it */
  client: string | null
  /** why the list is empty, in words the dashboard can show as-is */
  note: string | null
  options: PreviousContractOption[]
}

/** The quote number a project folder is named after ("324.1 - ..." → "324.1"). */
export function quoteNumberFromFolderName(folderName: string): string | null {
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(folderName)
  return m ? m[1] : null
}

/**
 * Client names are typed by hand on Monday and drift between forms — the same
 * developer appears as "אשטרום מגורים" on one quote and "אשטרום מגורים יזמות בע\"מ"
 * on another. Matching the raw strings splits one client into several and loses
 * exactly the comparisons this feature exists for, so match on a normalized form:
 * quotes and brackets dropped, legal-entity boilerplate removed.
 */
const LEGAL_NOISE = /(^|\s)(בע"מ|בעמ|ע"ר|חברה|חב'|בע״מ|ע״ר|ltd|inc)(?=\s|$)/gi

export function normalizeClient(name: string): string {
  return name
    .replace(/["'״׳()]/g, ' ')
    .replace(LEGAL_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Same client? True for identical names and for one being a whole-word prefix of
 * the other ("אשטרום מגורים" ⊂ "אשטרום מגורים יזמות"). Deliberately not a loose
 * substring test — "נתיבי איילון" and "נתיבי ישראל" are different companies.
 */
export function sameClient(a: string, b: string): boolean {
  const x = normalizeClient(a)
  const y = normalizeClient(b)
  if (!x || !y) return false
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `)
}

async function findRecordByQuoteNumber(quoteNumber: string) {
  // The index stores quote numbers as written, which includes zero-padded forms
  // ("096"); a folder may carry either.
  const variants = Array.from(
    new Set([quoteNumber, quoteNumber.padStart(3, '0'), String(Number(quoteNumber))])
  ).filter((v) => v && v !== 'NaN')
  return QuoteRecord.findOne({ quoteNumber: { $in: variants } })
}

/**
 * Signed contracts from other projects of the same client. Returns an empty list
 * with a `note` — never an error — when the client can't be resolved: comparing
 * is optional, so a project outside the index must not block a review.
 */
export async function suggestPreviousContracts(
  projectFolderName: string
): Promise<PreviousContractSuggestions> {
  await connectDB()

  const quoteNumber = quoteNumberFromFolderName(projectFolderName)
  if (!quoteNumber) {
    return { client: null, note: 'לא זוהה מספר הצעה בשם התיקייה — אפשר לבחור הסכם קודם ידנית.', options: [] }
  }

  const record = await findRecordByQuoteNumber(quoteNumber)
  if (!record) {
    return {
      client: null,
      note: `הצעה ${quoteNumber} לא נמצאה באינדקס ההצעות — אפשר לבחור הסכם קודם ידנית.`,
      options: [],
    }
  }
  const client = (record.client ?? '').trim()
  if (!client) {
    return {
      client: null,
      note: 'לא רשום לקוח על ההצעה הזו במאנדיי — אפשר לבחור הסכם קודם ידנית.',
      options: [],
    }
  }

  // Name variants can't be matched in the query, so pull the (small) set of
  // records that have a client and a folder, and match in JS.
  const all = await QuoteRecord.find({
    client: { $nin: [null, ''] },
    driveFolderUrl: { $nin: [null, ''] },
  })
    .select({ quoteNumber: 1, name: 1, client: 1, driveFolderUrl: 1, quoteSentDate: 1 })
    .lean()

  const siblings = all
    .filter((s) => s.quoteNumber !== record.quoteNumber && sameClient(s.client ?? '', client))
    .sort((a, b) => (b.quoteSentDate ?? '').localeCompare(a.quoteSentDate ?? ''))
    .slice(0, MAX_SIBLINGS)

  if (siblings.length === 0) {
    return { client, note: `אין פרויקטים קודמים של ${client} באינדקס.`, options: [] }
  }

  const found = await Promise.all(
    siblings.map(async (s) => {
      const folderId = parseFolderId(s.driveFolderUrl ?? '')
      if (!folderId) return null
      try {
        const slot = await contractCandidates(folderId)
        // Only the confident pick — a folder of insurance annexes has nothing to compare.
        const best = slot.candidates.find((c) => c.fileId === slot.suggestedFileId)
        if (!best) return null
        return {
          fileId: best.fileId,
          name: best.name,
          mimeType: best.mimeType,
          modifiedTime: best.modifiedTime,
          projectLabel: `${s.quoteNumber ?? '?'} - ${s.name}`,
          projectFolderId: folderId,
        } satisfies PreviousContractOption
      } catch {
        return null // a single unreadable project must not fail the whole suggestion
      }
    })
  )

  const options = found.filter((o): o is PreviousContractOption => o !== null)
  return {
    client,
    note: options.length === 0 ? `ל-${client} יש פרויקטים קודמים, אך לא נמצא בהם הסכם חתום.` : null,
    options,
  }
}
