/**
 * One-off backfill: reconstruct issuesSnapshot for saved reports created before
 * snapshots existed, by parsing each report's stored Excel attachment. The
 * gmail-draft route persists snapshots for new reports going forward.
 *
 * Columns in the stored XLSX (see lib/server/reportXlsx.ts):
 *   1 '#' (displayId as "#123" or a plain row number), 5 discipline, 6 status
 *   (English label — reversed via normalizeStatus).
 *
 *   cd C:\easybim-platform\apps\epm
 *   npx tsx --env-file=.env.local scripts/backfillReportSnapshots.ts
 */
import mongoose from 'mongoose'
import ExcelJS from 'exceljs'
import { normalizeStatus } from '../lib/reportGrouping'

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1) }

const Report = mongoose.models.Report ?? mongoose.model('Report', new mongoose.Schema({
  xlsx:           Buffer,
  issuesSnapshot: { type: [Object], default: undefined },
}, { timestamps: true, strict: false }))

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text          // hyperlink cell
    if ('richText' in v) return v.richText.map(r => r.text).join('')
  }
  return String(v)
}

async function main() {
  await mongoose.connect(MONGODB_URI!)
  const docs = await Report.find({ issuesSnapshot: { $exists: false }, xlsx: { $exists: true } })
    .select('_id xlsx title createdAt')

  console.log(`${docs.length} reports without a snapshot.`)
  let updated = 0, skipped = 0

  for (const doc of docs) {
    const xlsx = doc.get('xlsx') as Buffer | undefined
    if (!xlsx?.length) { skipped++; continue }
    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(xlsx as unknown as ArrayBuffer)
      const ws = wb.getWorksheet('Issues') ?? wb.worksheets[0]
      if (!ws) { skipped++; continue }

      const snapshot: Array<{ id: string; displayId?: string; status: string; discipline?: string }> = []
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return // header
        const num        = cellText(row.getCell(1).value).trim()
        const discipline = cellText(row.getCell(5).value).trim()
        const status     = cellText(row.getCell(6).value).trim()
        if (!status) return
        const displayId = num.startsWith('#') ? num.slice(1) : undefined
        snapshot.push({
          id:         displayId ?? `row-${rowNumber}`,
          displayId,
          status:     normalizeStatus(status),
          discipline: discipline || undefined,
        })
      })

      if (snapshot.length === 0) { skipped++; continue }
      await Report.updateOne({ _id: doc._id }, { $set: { issuesSnapshot: snapshot } })
      updated++
      console.log(`  ✓ ${doc.get('title')} (${new Date(doc.get('createdAt')).toISOString().slice(0, 10)}) — ${snapshot.length} issues`)
    } catch (err) {
      skipped++
      console.warn(`  ✗ ${doc._id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`Done. Updated: ${updated}, skipped: ${skipped}`)
  await mongoose.disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
