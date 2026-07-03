// Squirrel = the EasyBIM price-quote management agent.
// Resolved MA-001-Price Quotes board constants (verified 2026-07-03) + typed helpers.
import {
  changeColumnValues,
  createNotification,
  createUpdate,
  getItems,
  getUpdateAssets,
  searchItemsByName,
  MondayAsset,
  MondayItem,
} from '@/lib/integrations/monday/client'

export const BOARD_ID = '6105725242' // MA-001-Price Quotes
export const MAXIM_USER_ID = '26773504'

export const COL = {
  quoteNumber: 'numbers0', // מספר הצעה
  projectType: 'dropdown8', // סוג פרויקט (trigger label "C")
  // ── contact parties (all mirror/board-relation → MA-006-Contacts 8161875627, read via display_value) ──
  developer: 'mirror_mknarad0', // יזם ראשי (also used as the primary "client" for grouping)
  developerContact: 'connect_boards_mkmwvweq', // איש קשר מטעם היזם
  projectManagement: 'lookup_mkx6rdp2', // ניהול הפרויקט
  projectManagerContact: 'board_relation_mkx6gbnj', // איש קשר מטעם מנהל פרויקט
  workOrderer: 'lookup_mm4bkg2y', // מזמין העבודה
  workOrdererContact: 'board_relation_mm4b3fd0', // איש קשר טעם מזמין העבודה
  clientFormula: 'formula_mkzmngff', // Formulaמזמין (unusable via API — returns "null"; kept for reference)
  status: 'status', // סטאטוס
  sheetLink: 'link_mm1ebc51', // תכנון עבודה 2 → Sheets template
  docLink: 'link_mm1hr4hg', // קובץ הצעה 2 → generated quote Doc
  gdriveLink: 'link_mm3wdkkz', // GDrive → project folder
  // ── extra columns indexed for analytics ──
  location: 'text', // מקום
  service: 'dropdown', // שירות
  usageType: 'dropdown__1', // סוג השימוש
  stage: 'dropdown_1', // שלב
  price: 'numbers', // מחיר (₪)
  owner: 'people0', // אחראי
  quoteSentDate: 'date', // תאריך שליחת ההצעה
  responseDate: 'date4', // תאריך קבלת תשובה
} as const

export const TYPE_C_LABEL = 'C'

const ALL_COLS = [
  COL.quoteNumber,
  COL.projectType,
  COL.developer,
  COL.developerContact,
  COL.projectManagement,
  COL.projectManagerContact,
  COL.workOrderer,
  COL.workOrdererContact,
  COL.status,
  COL.sheetLink,
  COL.docLink,
  COL.gdriveLink,
]

export interface QuoteItem {
  id: string
  name: string
  quoteNumber: string | null
  projectType: string | null
  client: string | null // = developer (יזם ראשי)
  developer: string | null
  developerContact: string | null
  projectManagement: string | null
  projectManagerContact: string | null
  workOrderer: string | null
  workOrdererContact: string | null
  status: string | null
  sheetLink: string | null
  docLink: string | null
  gdriveLink: string | null
}

function textOf(item: MondayItem, id: string): string | null {
  const v = item.column_values.find((c) => c.id === id)?.text
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/** Value of a mirror/formula/board-relation column: prefer display_value, ignore the literal "null". */
export function disp(item: MondayItem, id: string): string | null {
  const cv = item.column_values.find((c) => c.id === id)
  const d = (cv?.display_value ?? '').trim()
  if (d && d !== 'null') return d
  const t = (cv?.text ?? '').trim()
  return t && t !== 'null' ? t : null
}

function toQuoteItem(it: MondayItem): QuoteItem {
  return {
    id: it.id,
    name: it.name,
    quoteNumber: textOf(it, COL.quoteNumber),
    projectType: textOf(it, COL.projectType),
    client: disp(it, COL.developer),
    developer: disp(it, COL.developer),
    developerContact: disp(it, COL.developerContact),
    projectManagement: disp(it, COL.projectManagement),
    projectManagerContact: disp(it, COL.projectManagerContact),
    workOrderer: disp(it, COL.workOrderer),
    workOrdererContact: disp(it, COL.workOrdererContact),
    status: textOf(it, COL.status),
    sheetLink: textOf(it, COL.sheetLink),
    docLink: textOf(it, COL.docLink),
    gdriveLink: textOf(it, COL.gdriveLink),
  }
}

export async function readQuoteItem(itemId: string): Promise<QuoteItem | null> {
  const items = await getItems([itemId], ALL_COLS)
  return items[0] ? toQuoteItem(items[0]) : null
}

export async function searchQuoteItems(term: string): Promise<QuoteItem[]> {
  const items = await searchItemsByName(BOARD_ID, term, ALL_COLS)
  return items.map(toQuoteItem)
}

/** Project folder name convention: "<מספר הצעה> - <item name>", e.g. "1234 - מגדל רסיטל". */
export function folderName(item: Pick<QuoteItem, 'quoteNumber' | 'name'>): string {
  const num = (item.quoteNumber ?? '').toString().trim()
  const base = num ? `${num} - ${item.name}` : item.name
  // Sanitise for a Drive folder name.
  return base.replace(/[\\/:*?"<>|]/g, '_').trim()
}

/** True only when the item is a Type-C quote WITH a quote number set (both trigger conditions). */
export function isReadyForSetup(item: QuoteItem): boolean {
  return item.projectType === TYPE_C_LABEL && !!item.quoteNumber
}

/** True if the plumbing already ran for this item (folder/links already set). */
export function isAlreadySetUp(item: QuoteItem): boolean {
  return !!item.gdriveLink || !!item.sheetLink
}

export async function setLink(itemId: string, colId: string, url: string, text?: string): Promise<void> {
  await changeColumnValues(BOARD_ID, itemId, { [colId]: { url, text: text ?? url } })
}

export async function postUpdate(itemId: string, bodyHtml: string): Promise<string> {
  return createUpdate(itemId, bodyHtml)
}

export async function notifyMaxim(itemId: string, text: string): Promise<void> {
  await createNotification(MAXIM_USER_ID, itemId, text, 'Project')
}

export async function getMaterialAssets(itemId: string): Promise<MondayAsset[]> {
  return getUpdateAssets(itemId)
}
