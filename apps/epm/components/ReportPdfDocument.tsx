'use client'

// Hidden, fixed-width (A4 @ ~96dpi) report node that gets rasterized into the
// PDF. RTL, inline hex styles only (html-to-image safe). Contains header +
// analytics bars + the filtered issues table. NO email text, NO screenshot.
import { forwardRef } from 'react'
import type { AccIssue } from '@/lib/services/apsService'
import { type GroupKey, GROUP_OPTIONS, statusColor, statusLabel, segmentTextColor } from '@/lib/reportGrouping'
import AnalyticsBars from './AnalyticsBars'

const A4_WIDTH = 794 // px ≈ 210mm @ 96dpi

const cell: React.CSSProperties = {
  border: '1px solid #e5e7eb', padding: '5px 7px', fontSize: 10, textAlign: 'right', verticalAlign: 'top',
}
const head: React.CSSProperties = {
  ...cell, background: '#f1f3f8', color: '#1e248c', fontWeight: 700, fontSize: 9,
}

const ReportPdfDocument = forwardRef<HTMLDivElement, {
  projectName: string
  projectNumber?: string
  templateTitle: string
  groupBy: GroupKey
  issues: AccIssue[]
  filtersSummary: string
}>(function ReportPdfDocument({ projectName, projectNumber, templateTitle, groupBy, issues, filtersSummary }, ref) {
  const today = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' })
  const groupLabel = GROUP_OPTIONS.find(o => o.value === groupBy)?.label ?? groupBy

  return (
    // Positioned off-screen (not display:none — html-to-image needs layout)
    <div style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1, pointerEvents: 'none' }} aria-hidden>
      <div ref={ref} dir="rtl" style={{
        width: A4_WIDTH, boxSizing: 'border-box', padding: 32, background: '#fff',
        fontFamily: 'Arial, Assistant, sans-serif', color: '#374151', textAlign: 'right',
      }}>
        {/* Header — title block (right, RTL start) + logo (left) */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: '2px solid #1e248c', paddingBottom: 12, marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e248c' }}>{templateTitle}</div>
            <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{projectName}{projectNumber ? ` · ${projectNumber}` : ''}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>הופק בתאריך {today} · {issues.length} נושאים · {filtersSummary}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/easybim_logo-w.png" alt="EasyBIM" style={{ height: 44, width: 'auto', flexShrink: 0, marginRight: 16 }} />
        </div>

        {/* Analytics */}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e248c', marginBottom: 8 }}>נושאים לפי {groupLabel}</div>
        <AnalyticsBars issues={issues} groupBy={groupBy} maxRows={12} width={A4_WIDTH - 64} />

        {/* Issues table */}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e248c', margin: '18px 0 8px' }}>פירוט נושאים</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...head, width: 24 }}>#</th>
              <th style={{ ...head, width: 150 }}>כותרת</th>
              <th style={{ ...head }}>תיאור</th>
              <th style={{ ...head, width: 80 }}>משויך</th>
              <th style={{ ...head, width: 75 }}>דיסציפלינה</th>
              <th style={{ ...head, width: 64 }}>סטטוס</th>
              <th style={{ ...head, width: 64 }}>סוג</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i, idx) => (
              <tr key={i.id}>
                <td style={{ ...cell, color: '#9ca3af' }}>{idx + 1}</td>
                <td style={{ ...cell, wordBreak: 'break-word' }}>{i.title}</td>
                <td style={{ ...cell, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }} dir="rtl">{i.description?.trim() || '—'}</td>
                <td style={{ ...cell }}>{i.assignedTo ?? '—'}</td>
                <td style={{ ...cell }}>{i.discipline || '—'}</td>
                <td style={{ ...cell }}>
                  <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 600, background: statusColor(i.status), color: segmentTextColor(i.status) }}>
                    {statusLabel(i.status)}
                  </span>
                </td>
                <td style={{ ...cell }}>{i.issueType}</td>
              </tr>
            ))}
            {issues.length === 0 && (
              <tr><td style={{ ...cell, textAlign: 'center', color: '#9ca3af' }} colSpan={7}>אין נושאים</td></tr>
            )}
          </tbody>
        </table>

        {/* Signature — EasyBIM docs template footer */}
        <div style={{ borderTop: '1px solid #d1d5db', marginTop: 28, paddingTop: 10, textAlign: 'center', fontSize: 10, color: '#374151', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700 }}>איזיבים הנדסה טכנולוגית בע"מ</span>
          {' | '}טלפון: 03-6888477
          {' | '}אתר: <span style={{ color: '#1e248c' }}>www.easybim.co.il</span>
          {' | '}דוא"ל: <span style={{ color: '#1e248c' }}>office@easybim.co.il</span>
          {' | '}כתובת: תובל 22, רמת גן
        </div>
      </div>
    </div>
  )
})

export default ReportPdfDocument
