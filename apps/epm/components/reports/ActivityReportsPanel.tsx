'use client'

import { useState } from 'react'
import { FileText, Mail, BarChart2, Trash2, Loader2, TrendingUp, Clock } from 'lucide-react'
import type { ReportListItem } from '@/lib/types'
import ReportViewModal from '../ReportViewModal'
import ProgressModal from '../ProgressModal'

// Activity & Reports — the project's report history, with the Progress
// comparison. Rendered as a card on the project page and as a tab in the
// Reports drawer, so both stay in step by construction.

// Short relative time for the activity list (he-IL).
function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'הרגע'
  if (m < 60) return `לפני ${m} דק׳`
  const h = Math.round(m / 60)
  if (h < 24) return `לפני ${h} שע׳`
  const d = Math.round(h / 24)
  if (d < 30) return `לפני ${d} ימים`
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ActivityReportsPanel({
  projectId,
  reports,
  onDeleted,
  anaView = false,
  variant = 'card',
}: {
  projectId: string
  reports: ReportListItem[]
  onDeleted: (reportId: string) => void
  // ANA client view: read-only (no delete).
  anaView?: boolean
  // 'card'  → the compact glass card on the project page (scrolls at 168px)
  // 'panel' → the drawer tab: no card chrome, full height
  variant?: 'card' | 'panel'
}) {
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)
  const [progressOpen, setProgressOpen] = useState(false)

  // Progress needs two reports with issue snapshots to compare.
  const comparableReports = reports.filter(r => r.hasSnapshot).length
  // Sent (emailed) vs internal (analytics-only) split, shown in the header.
  const internalCount = reports.filter(r => r.kind === 'internal').length
  const sentCount = reports.length - internalCount

  async function handleDeleteReport(reportId: string) {
    if (deletingReportId) return
    if (!confirm('למחוק את הדוח? לא ניתן לשחזר.')) return
    setDeletingReportId(reportId)
    try {
      const res = await fetch(`/api/projects/${projectId}/reports/${reportId}`, { method: 'DELETE' })
      if (res.ok) onDeleted(reportId)
      else alert('מחיקת הדוח נכשלה. נסו שוב.')
    } catch {
      alert('שגיאת רשת. נסו שוב.')
    } finally {
      setDeletingReportId(null)
    }
  }

  const isPanel = variant === 'panel'

  return (
    <div className={isPanel ? 'flex flex-col gap-3' : 'glass-card rounded-2xl p-4 flex flex-col gap-3'}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
          <FileText size={15} className="text-[#44b8d3]" /> Activity &amp; Reports
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setProgressOpen(true)}
            disabled={comparableReports < 2}
            title={comparableReports < 2 ? 'Needs at least two saved reports to compare' : 'Compare issue status between reports'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#1e248c] bg-indigo-50 hover:bg-indigo-100 disabled:text-gray-300 disabled:bg-gray-50 disabled:cursor-not-allowed transition-colors"
          >
            <TrendingUp size={12} /> Progress
          </button>
          <span dir="rtl" className="flex items-center gap-2 text-[10px] font-mono">
            <span className="inline-flex items-center gap-1 text-[#1e248c]"><Mail size={10} /> {sentCount}</span>
            <span className="inline-flex items-center gap-1 text-amber-600"><BarChart2 size={10} /> {internalCount}</span>
          </span>
        </div>
      </div>
      <div className={`flex flex-col gap-3 overflow-y-auto pr-1 ${isPanel ? '' : 'max-h-[168px]'}`}>
        {reports.length === 0 && (
          <p dir="rtl" className="text-xs text-gray-400 py-2">עדיין לא נוצרו דוחות. צרו טיוטת מייל בעמוד הדוחות והם יופיעו כאן.</p>
        )}
        {reports.map(r => {
          const internal = r.kind === 'internal'
          return (
            <div key={r._id} dir="rtl" className={`group flex items-start gap-3 p-2 -mx-1 rounded-lg border-b border-gray-100 last:border-0 ${internal ? 'bg-amber-50/40' : ''}`}>
              <button onClick={() => setOpenReportId(r._id)} className="flex items-start gap-3 flex-1 min-w-0 text-right">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${internal ? 'bg-amber-50' : 'bg-[#e7eefe]'}`}>
                  {internal ? <BarChart2 size={14} className="text-amber-600" /> : <Mail size={14} className="text-[#1e248c]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-[#1e248c]">{r.title}</p>
                    <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-px rounded-full ${internal ? 'bg-amber-100 text-amber-700' : 'bg-[#e7eefe] text-[#1e248c]'}`}>
                      {internal ? 'ניתוח פנימי' : 'נשלח'}
                    </span>
                    {/* Produced by a schedule rather than by hand. */}
                    {r.scheduleName && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-px rounded-full bg-emerald-50 text-emerald-700">
                        <Clock size={9} /> {r.scheduleName}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">
                    {internal ? 'לא נשלח במייל' : `${r.recipients.length} נמענים`}{typeof r.issueCount === 'number' ? ` · ${r.issueCount} נושאים` : ''}{r.createdByName ? ` · ${r.createdByName}` : ''}
                  </p>
                </div>
              </button>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-gray-400">{timeAgo(r.createdAt)}</span>
                <button onClick={() => setOpenReportId(r._id)} className="text-[10px] text-[#44b8d3] hover:underline">צפייה</button>
              </div>
              {!anaView && (
                <button
                  onClick={() => handleDeleteReport(r._id)}
                  disabled={deletingReportId === r._id}
                  title="מחק דוח"
                  className="shrink-0 self-center text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {deletingReportId === r._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {progressOpen && (
        <ProgressModal
          projectId={projectId}
          reports={reports}
          onClose={() => setProgressOpen(false)}
        />
      )}

      {openReportId && (
        <ReportViewModal
          projectId={projectId}
          reportId={openReportId}
          onClose={() => setOpenReportId(null)}
          onDeleted={id => onDeleted(id)}
        />
      )}
    </div>
  )
}
