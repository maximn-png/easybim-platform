// Server-side Excel (.xlsx) builder for the BIM report, styled with the EasyBIM
// palette (ExcelJS — SheetJS CE can't write cell styles). The issue-number column
// links to the issue in ACC; status cells are colour-coded to match the report.
import 'server-only'
import ExcelJS from 'exceljs'
import type { AccIssue } from '@/lib/services/apsService'
import { statusColor, statusLabel, segmentTextColor } from '@/lib/reportGrouping'

// EasyBIM brand colours as ARGB.
const NAVY      = 'FF1E248C'
const ZEBRA     = 'FFF0F3FF'
const WHITE     = 'FFFFFFFF'
const BORDER    = 'FFE5E7EB'
const FONT      = 'Arial'

const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase()

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const thin = { style: 'thin' as const, color: { argb: BORDER } }
const allBorders = { top: thin, left: thin, bottom: thin, right: thin }

export async function generateReportXlsx(issues: AccIssue[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EasyBIM'

  const ws = wb.addWorksheet('Issues', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  })

  ws.columns = [
    { header: '#',           key: 'num',        width: 10 },
    { header: 'כותרת',       key: 'title',      width: 34 },
    { header: 'תיאור',       key: 'desc',       width: 52 },
    { header: 'משויך',       key: 'assignee',   width: 20 },
    { header: 'דיסציפלינה',  key: 'discipline', width: 16 },
    { header: 'סטטוס',       key: 'status',     width: 14 },
    { header: 'סוג',         key: 'type',       width: 16 },
    { header: 'נוצר',        key: 'created',     width: 12 },
    { header: 'עודכן',       key: 'updated',     width: 12 },
    { header: 'נסגר',        key: 'closed',      width: 12 },
  ]

  // Header row — navy fill, white bold text.
  const head = ws.getRow(1)
  head.height = 22
  head.eachCell(c => {
    c.font = { name: FONT, size: 11, bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
    c.border = allBorders
  })

  issues.forEach((issue, idx) => {
    const numText = issue.displayId ? `#${issue.displayId}` : String(idx + 1)
    const row = ws.addRow({
      num:        numText,
      title:      issue.title ?? '',
      desc:       issue.description?.trim() ?? '',
      assignee:   issue.assignedTo ?? '',
      discipline: issue.discipline ?? '',
      status:     statusLabel(issue.status),
      type:       issue.issueType ?? '',
      created:    fmtDate(issue.createdAt),
      updated:    fmtDate(issue.updatedAt),
      closed:     fmtDate(issue.closedAt),
    })

    // Base cell style + zebra striping.
    const zebra = idx % 2 === 1
    row.eachCell(c => {
      c.font = { name: FONT, size: 10, color: { argb: 'FF374151' } }
      c.alignment = { vertical: 'top', horizontal: 'right', wrapText: true }
      c.border = allBorders
      if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
    })

    // Issue number → hyperlink to the issue in ACC (blue, underlined).
    const numCell = row.getCell('num')
    if (issue.url) numCell.value = { text: numText, hyperlink: issue.url }
    numCell.font = { name: FONT, size: 10, bold: true, color: { argb: NAVY }, underline: !!issue.url }
    numCell.alignment = { vertical: 'top', horizontal: 'center' }

    // Status cell → colour-coded pill matching the chart.
    const stCell = row.getCell('status')
    stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(statusColor(issue.status)) } }
    stCell.font = { name: FONT, size: 10, bold: true, color: { argb: argb(segmentTextColor(issue.status)) } }
    stCell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: issues.length + 1, column: ws.columnCount } }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
