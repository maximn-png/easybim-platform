'use client'

// Read-only view of a saved report draft: the rendered email (left) beside the
// embedded PDF (right). Loads the full report (previewHtml + metadata) on open;
// the PDF streams from the dedicated endpoint.
import { useEffect, useState } from 'react'
import { X, Mail, Download, ExternalLink, Loader2, Trash2 } from 'lucide-react'

interface ReportDetail {
  _id: string
  kind?: 'email' | 'internal'
  title: string
  subject: string
  recipients: string[]
  previewHtml: string
  pdfName: string
  draftId?: string
  gmailUrl?: string
  issueCount?: number
  filtersSummary?: string
  createdByName?: string
  createdAt: string | null
}

export default function ReportViewModal({
  projectId, reportId, onClose, onDeleted, external = false,
}: {
  projectId: string
  reportId: string
  onClose: () => void
  onDeleted: (id: string) => void
  // ANA client view: hide internal-only bits (recipient list, Gmail draft link,
  // delete) — leaving the email preview + PDF.
  external?: boolean
}) {
  const [report, setReport] = useState<ReportDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const pdfUrl = `/api/projects/${projectId}/reports/${reportId}/pdf`

  useEffect(() => {
    let alive = true
    fetch(`/api/projects/${projectId}/reports/${reportId}`)
      .then(async r => {
        const data = await r.json() as { report?: ReportDetail; error?: string }
        if (!alive) return
        if (data.error) setError(data.error)
        else setReport(data.report ?? null)
      })
      .catch(e => { if (alive) setError(String(e)) })
    return () => { alive = false }
  }, [projectId, reportId])

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleDelete = async () => {
    if (deleting) return
    if (!window.confirm('למחוק את הדוח מההיסטוריה? לא ניתן לשחזר.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/reports/${reportId}`, { method: 'DELETE' })
      if (!res.ok) { setError('מחיקה נכשלה'); setDeleting(false); return }
      onDeleted(reportId)
      onClose()
    } catch (e) {
      setError(String(e)); setDeleting(false)
    }
  }

  const createdAt = report?.createdAt
    ? new Date(report.createdAt).toLocaleString('he-IL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto p-4 md:p-8"
      style={{ background: 'rgba(28,32,52,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-auto"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-l from-[#f0f3ff] to-white">
          <div className="w-9 h-9 rounded-lg grid place-items-center text-white" style={{ background: 'linear-gradient(135deg,#1e248c,#44b8d3)' }}>
            <Mail size={17} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-[#1e248c] leading-tight truncate">{report?.title ?? 'טוען דוח…'}</h1>
            {report && (
              <p className="text-[11px] text-gray-500 truncate">
                {createdAt}{report.createdByName ? ` · ${report.createdByName}` : ''}{typeof report.issueCount === 'number' ? ` · ${report.issueCount} נושאים` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="ms-auto w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <X size={16} />
          </button>
        </div>

        {error && <div className="m-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

        {!report && !error && (
          <div className="p-16 flex items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        )}

        {report && (
          <>
            {/* Recipients + actions */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
              {!external && (
                report.kind === 'internal' ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">ניתוח פנימי · לא נשלח במייל</span>
                ) : (
                  <>
                    <span className="text-[10px] font-mono text-gray-400">אל</span>
                    <span className="text-xs text-gray-700">{report.recipients.join(', ') || '—'}</span>
                  </>
                )
              )}
              <div className="ms-auto flex items-center gap-2">
                {!external && report.gmailUrl && (
                  <a href={report.gmailUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:border-[#44b8d3]">
                    <ExternalLink size={13} /> פתח טיוטה ב-Gmail
                  </a>
                )}
                <a href={`${pdfUrl}?download=1`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:border-[#44b8d3]">
                  <Download size={13} /> הורד PDF
                </a>
                {!external && (
                  <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60">
                    {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} מחק
                  </button>
                )}
              </div>
            </div>

            {/* Email preview + PDF side by side */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              <div className="flex flex-col">
                <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2">תצוגת המייל</p>
                <iframe title="email" srcDoc={report.previewHtml} className="w-full h-[60vh] rounded-xl border border-gray-200 bg-white" sandbox="" />
              </div>
              <div className="flex flex-col">
                <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2">קובץ PDF מצורף</p>
                <iframe title="pdf" src={pdfUrl} className="w-full h-[60vh] rounded-xl border border-gray-200 bg-gray-50" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
