import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import * as board from './board'
import * as drive from './drive'
import { upsertOne } from './quoteIndex'
import { parseFolderId } from '@/lib/integrations/google/client'

function mondayToken(): string {
  const t = process.env.MONDAY_API_TOKEN
  if (!t) throw new Error('MONDAY_API_TOKEN is not configured')
  return t
}

export const readQuoteItem = betaZodTool({
  name: 'read_quote_item',
  description:
    'Read one Monday price-quote item by id: name, quote number (מספר הצעה), project type (סוג פרויקט), client (מזמין), status, and existing links. Also reports readyForSetup (Type-C + quote number set) and alreadySetUp.',
  inputSchema: z.object({ itemId: z.string() }),
  run: async ({ itemId }) => {
    const it = await board.readQuoteItem(itemId)
    if (!it) return 'NOT_FOUND'
    return JSON.stringify({
      ...it,
      folderName: board.folderName(it),
      readyForSetup: board.isReadyForSetup(it),
      alreadySetUp: board.isAlreadySetUp(it),
    })
  },
})

export const findQuote = betaZodTool({
  name: 'find_quote',
  description:
    'Search price-quote items by name (contains). Use to locate an item when Maxim refers to a project by name rather than id.',
  inputSchema: z.object({ query: z.string() }),
  run: async ({ query }) => {
    const items = await board.searchQuoteItems(query)
    return JSON.stringify(
      items.map((it) => ({
        id: it.id,
        name: it.name,
        quoteNumber: it.quoteNumber,
        projectType: it.projectType,
        status: it.status,
        gdriveLink: it.gdriveLink,
        sheetLink: it.sheetLink,
        docLink: it.docLink,
      }))
    )
  },
})

export const setupProject = betaZodTool({
  name: 'setup_project',
  description:
    'Run the full setup for a Type-C quote item in ONE call. It resolves the client folder ITSELF from the item (יזם ראשי, else מזמין העבודה) or an explicit clientOverride, then creates "<מספר הצעה> - <name>" directly inside that client folder (subfolders + Type-C template + _meta + attachments), writes the Sheets/GDrive links back, notifies Maxim, and indexes it. Refuses and creates NOTHING if the item is not Type-C with a quote number, or if no client can be determined — it will NEVER invent a client from the item name. Idempotent.',
  inputSchema: z.object({
    itemId: z.string(),
    clientOverride: z
      .string()
      .optional()
      .describe('ONLY when Maxim explicitly names the client; otherwise omit — the client is taken from the item'),
  }),
  run: async ({ itemId, clientOverride }) => {
    const it = await board.readQuoteItem(itemId)
    if (!it) return 'NOT_FOUND'
    if (!board.isReadyForSetup(it))
      return 'SKIP: item is not Type-C (סוג פרויקט=C) with a quote number (מספר הצעה) set — nothing created.'
    if (board.isAlreadySetUp(it)) return 'ALREADY_SET_UP: this item already has GDrive/sheet links — nothing created.'

    // Client comes ONLY from an explicit override or the item's real client fields — never the item name.
    const client = clientOverride?.trim() || it.client || it.workOrderer
    if (!client)
      return 'NO_CLIENT: the item has no client (יזם ראשי / מזמין העבודה are empty). Set the client on Monday, or pass clientOverride. Will NOT create a folder from the item name.'

    const cf = await drive.ensureClientFolder(client)
    const projectFolderName = board.folderName(it)
    const assets = await board.getMaterialAssets(itemId)
    const result = await drive.setupProject({
      clientFolderId: cf.id,
      projectFolderName,
      itemId,
      assets,
      mondayToken: mondayToken(),
    })

    if (result.alreadyExisted) {
      return JSON.stringify({ alreadyExisted: true, client: cf.name, folderUrl: result.folderUrl })
    }

    if (result.sheetUrl) {
      await board.setLink(itemId, board.COL.sheetLink, result.sheetUrl, `${projectFolderName} - תכנון עבודה`)
    }
    await board.setLink(itemId, board.COL.gdriveLink, result.folderUrl, projectFolderName)

    const summary =
      `<div dir="rtl">🐿️ הוקם פרויקט: <b>${projectFolderName}</b> תחת הלקוח <b>${cf.name}</b>` +
      (cf.created ? ' (תיקיית לקוח חדשה נוצרה)' : '') +
      `.<br>נוצרו 3 תיקיות, הועתקה תבנית ההצעה, ונאספו ${result.downloaded} קבצים מ-Monday.<br>` +
      `<a href="${result.folderUrl}">תיקיית הפרויקט</a>` +
      (result.sheetUrl ? ` · <a href="${result.sheetUrl}">גיליון תכנון עבודה</a>` : '') +
      `</div>`
    await board.postUpdate(itemId, summary)
    await board.notifyMaxim(itemId, `🐿️ הוקם "${projectFolderName}" תחת ${cf.name} (${result.downloaded} קבצים).`)

    try {
      await upsertOne(itemId)
    } catch (e) {
      console.error('[squirrel] index upsert failed after setup:', (e as Error).message)
    }

    // Read the links back from Monday so the result is VERIFIED ground truth, not a claim.
    const verify = await board.readQuoteItem(itemId)
    return JSON.stringify({
      status: 'CREATED',
      client: cf.name,
      clientCreated: cf.created,
      folderUrl: result.folderUrl,
      sheetUrl: result.sheetUrl,
      downloaded: result.downloaded,
      verifiedGdriveLinkOnMonday: verify?.gdriveLink ?? null, // if null, creation did NOT persist — do not claim success
    })
  },
})

export const readReceivedMaterials = betaZodTool({
  name: 'read_received_materials',
  description:
    'List the files in a project\'s חומר שהתקבל מהמזמין folder (with a text extract for Google Docs / text files) so you can propose a scope. Give either the project folder id or the item id (its GDrive link is used to locate the folder).',
  inputSchema: z.object({
    projectFolderId: z.string().optional(),
    itemId: z.string().optional(),
  }),
  run: async ({ projectFolderId, itemId }) => {
    let folderId = projectFolderId
    if (!folderId && itemId) {
      const it = await board.readQuoteItem(itemId)
      const link = it?.gdriveLink ?? ''
      folderId = parseFolderId(link) ?? undefined
    }
    if (!folderId) return 'NO_FOLDER: provide projectFolderId, or an itemId whose GDrive link is set'
    const files = await drive.readReceivedMaterials(folderId)
    return JSON.stringify(files)
  },
})

export const proposeScope = betaZodTool({
  name: 'propose_scope',
  description:
    'Post a proposed work-scope (RTL HTML, mapped to the Type-C sections: שכר טרחה / ניהול מודל / תאום מערכות / מידול פתחים) to the item Updates and notify Maxim for review. This is a PROPOSAL only — never fill the ToQuote sheet directly.',
  inputSchema: z.object({
    itemId: z.string(),
    scopeHtml: z.string().describe('RTL HTML body, <div dir="rtl">…</div>'),
    notifyText: z.string().describe('short bell text for Maxim'),
  }),
  run: async ({ itemId, scopeHtml, notifyText }) => {
    await board.postUpdate(itemId, scopeHtml)
    await board.notifyMaxim(itemId, notifyText)
    return 'posted scope proposal + notified Maxim'
  },
})

export const notifyMaxim = betaZodTool({
  name: 'notify_maxim',
  description:
    'Send Maxim a bell notification on an item (use when you cannot resolve the client folder confidently, or need a human decision before proceeding).',
  inputSchema: z.object({ itemId: z.string(), text: z.string() }),
  run: async ({ itemId, text }) => {
    await board.notifyMaxim(itemId, text)
    return 'notified Maxim'
  },
})

export const squirrelTools = [
  readQuoteItem,
  findQuote,
  setupProject,
  readReceivedMaterials,
  proposeScope,
  notifyMaxim,
]
