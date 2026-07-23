'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronRight, FileText, Mail, Box } from 'lucide-react'
import type { ProjectRow, ReportListItem } from '@/lib/types'
import StatusBadge from '@/components/StatusBadge'
import ProjectLinksBar from '@/components/ProjectLinksBar'
import FormaConnectPanel from '@/components/FormaConnectPanel'
import ReportViewModal from '@/components/ReportViewModal'

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

export default function AnaProjectDetailClient({
  project,
  reports,
}: {
  project: ProjectRow
  reports: ReportListItem[]
}) {
  const [openReportId, setOpenReportId] = useState<string | null>(null)

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f6fb 0%, #e7f1fe 100%)' }}
    >
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex flex-col gap-5">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-gray-500">
            <Link href="/ana" className="hover:text-[#1e248c] transition-colors">ANA Projects</Link>
            <ChevronRight size={12} />
            <span className="text-[#1e248c] font-medium" dir="rtl">{project.projectName}</span>
          </nav>

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-[#44b8d3] uppercase tracking-widest">
                {project.ana?.number || project.projectNumber}
              </p>
              <h1 className="text-3xl font-bold text-[#1e248c] mt-1 leading-tight text-left" dir="rtl">
                {project.projectName}
              </h1>
              <div className="mt-3">
                <ProjectLinksBar project={project} />
              </div>
            </div>
            <StatusBadge status={project.status} />
          </div>

          {/* ACC combined-model viewer — Phase 2 placeholder */}
          <div className="glass-card rounded-2xl p-5">
            <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2 mb-3">
              <Box size={15} className="text-[#44b8d3]" /> Combined Model
            </h2>
            <div className="rounded-xl border border-dashed border-[#44b8d3]/40 bg-white/50 h-64 flex flex-col items-center justify-center gap-2 text-center">
              <Box size={28} className="text-[#44b8d3]/50" />
              <p className="text-sm text-gray-500">The combined ACC model viewer will appear here.</p>
              <p className="text-[11px] text-gray-400">Coming soon</p>
            </div>
          </div>

          {/* Activity & Reports + Forms & Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Activity & Reports (read-only for ANA) */}
            <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
                  <FileText size={15} className="text-[#44b8d3]" /> Activity &amp; Reports
                </h2>
                <span dir="rtl" className="text-[10px] text-gray-400 font-mono">{reports.length} דוחות</span>
              </div>
              <div className="flex flex-col gap-3">
                {reports.length === 0 && (
                  <p dir="rtl" className="text-xs text-gray-400 py-2">עדיין לא נוצרו דוחות עבור פרויקט זה.</p>
                )}
                {reports.map(r => (
                  <button
                    key={r._id}
                    onClick={() => setOpenReportId(r._id)}
                    dir="rtl"
                    className="group flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0 text-right w-full"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#e7eefe] flex items-center justify-center shrink-0">
                      <Mail size={14} className="text-[#1e248c]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-[#1e248c]">{r.title}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {typeof r.issueCount === 'number' ? `${r.issueCount} נושאים` : ''}
                        {r.createdByName ? ` · ${r.createdByName}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(r.createdAt)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Forms & Actions */}
            <FormaConnectPanel
              projectId={project._id}
              projectNumber={project.projectNumber}
              accProjectId={project.accProjectId}
              accUrl={project.links.acc}
              accExternalHub={project.accExternalHub}
              partnerHubName={project.accHubName}
              partnerHubKey={project.accHubKey}
              basePath="/ana"
            />
          </div>
        </div>
      </div>

      {openReportId && (
        <ReportViewModal
          projectId={project._id}
          reportId={openReportId}
          external
          onClose={() => setOpenReportId(null)}
          onDeleted={() => setOpenReportId(null)}
        />
      )}
    </div>
  )
}
