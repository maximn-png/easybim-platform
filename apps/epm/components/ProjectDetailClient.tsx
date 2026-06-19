'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ChevronRight,
  FileText,
  Mail,
  Users,
  BarChart2,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import type { ProjectRow, ReportListItem } from '@/lib/types'
import StatusBadge from './StatusBadge'
import TeamMemberCell from './TeamMemberCell'
import FormaConnectPanel from './FormaConnectPanel'
import ReportViewModal from './ReportViewModal'

// ── Helpers ────────────────────────────────────────────────────────────────

function Breadcrumb({ projectName }: { projectName: string }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500 mb-6">
      <Link href="/dashboard" className="hover:text-[#1e248c] transition-colors">Dashboard</Link>
      <ChevronRight size={12} />
      <Link href="/dashboard" className="hover:text-[#1e248c] transition-colors">EPM</Link>
      <ChevronRight size={12} />
      <span className="text-[#1e248c] font-medium" dir="rtl">{projectName}</span>
    </nav>
  )
}

function MilestoneRing({ value }: { value: number }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - value / 100)
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#e7eefe" strokeWidth="10" />
      <circle
        cx="48" cy="48" r={r} fill="none"
        stroke="#1e248c" strokeWidth="10"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="53" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e248c">
        {value}%
      </text>
    </svg>
  )
}

function DisciplineBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  // value may exceed 100 (over bank) — show the true % but clamp the bar fill.
  const fill = Math.min(100, Math.max(0, value ?? 0))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-[#1e248c]">{value === null ? '—' : `${value}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-[#e7eefe] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${fill}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

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

export default function ProjectDetailClient({
  project,
  reports: initialReports,
}: {
  project: ProjectRow
  reports: ReportListItem[]
}) {
  const router = useRouter()

  // Report history (seeded from server; mutated locally on delete).
  const [reports, setReports] = useState<ReportListItem[]>(initialReports)
  const [openReportId, setOpenReportId] = useState<string | null>(null)

  // Mock discipline splits
  const bimMilestone = 20
  const mepMilestone = 60
  const overallMilestone = Math.round((bimMilestone + mepMilestone) / 2)

  // Live hours from the same source as the Hours Analytics page (Monday), so the
  // card reflects edits immediately rather than the cached snapshot.actualHours
  // (which only refreshes when the updateHours job re-runs).
  const [hours, setHours] = useState<{
    modelMgmtSpent: number; modelMgmtBank: number | null
    superSpent: number; superBank: number | null
  } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/projects/${project._id}/hours-breakdown`)
      .then(r => r.json())
      .then((json: {
        breakdown?: { totalsBySubject?: Record<string, number> }
        banks?: { modelMgmt: number | null; superposition: number | null }
      }) => {
        if (!alive) return
        const totals = json.breakdown?.totalsBySubject ?? {}
        setHours({
          modelMgmtSpent: totals['Model MGMT'] ?? 0,
          modelMgmtBank: json.banks?.modelMgmt ?? null,
          superSpent: totals['Superposition'] ?? 0,
          superBank: json.banks?.superposition ?? null,
        })
      })
      .catch(() => { /* leave null → shows — */ })
    return () => { alive = false }
  }, [project._id])

  const pct = (spent: number, bank: number | null) => (bank && bank > 0 ? Math.round((spent / bank) * 100) : null)
  const modelMgmtPct = hours ? pct(hours.modelMgmtSpent, hours.modelMgmtBank) : null
  const superPct     = hours ? pct(hours.superSpent, hours.superBank) : null
  // Headline / totals from the two disciplines' live spent vs their banks.
  const liveSpent = hours ? hours.modelMgmtSpent + hours.superSpent : 0
  const liveBank  = hours ? (hours.modelMgmtBank ?? 0) + (hours.superBank ?? 0) : 0
  const headlinePct = hours && liveBank > 0 ? Math.round((liveSpent / liveBank) * 100) : null
  const hoursLeft = liveBank - liveSpent // signed: negative = over banked

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        {/* Main content */}
        <div className="min-w-0 flex flex-col gap-5">
          <Breadcrumb projectName={project.projectName} />

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-[#44b8d3] uppercase tracking-widest">{project.projectNumber}</p>
              <h1 className="text-3xl font-bold text-[#1e248c] mt-1 leading-tight" dir="rtl">
                {project.projectName}
              </h1>
            </div>
            <StatusBadge status={project.status} />
          </div>

          {/* 2×2 panel grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Milestone Status */}
            <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-[#44b8d3]" /> Milestone Status
                </h2>
                <Link href="#" className="text-xs text-[#44b8d3] hover:underline">Full Milestones →</Link>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col gap-3 flex-1">
                  <DisciplineBar label="BIM Management" value={bimMilestone} color="#1e248c" />
                  <DisciplineBar label="MEP Coordination" value={mepMilestone} color="#44b8d3" />
                </div>
                <div className="flex flex-col items-center shrink-0">
                  <MilestoneRing value={overallMilestone} />
                  <p className="text-[10px] text-gray-400 mt-1">Overall Stage</p>
                </div>
              </div>
              <div className="flex gap-2 text-xs text-gray-500 mt-auto">
                <span className="flex items-center gap-1"><Circle size={8} className="fill-[#44b8d3] text-[#44b8d3]" /> In Progress</span>
                <span className="flex items-center gap-1 ml-3"><Circle size={8} className="fill-green-500 text-green-500" /> Completed</span>
              </div>
            </div>

            {/* Hours Analytics summary */}
            <div
              className="glass-card rounded-2xl p-5 flex flex-col gap-4 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(`/dashboard/${project._id}/hours`)}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
                  <BarChart2 size={15} className="text-[#44b8d3]" /> Hours Analytics
                </h2>
                <span className="text-2xl font-bold text-[#1e248c]">
                  {headlinePct === null ? '—' : `${headlinePct}%`}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                <DisciplineBar label="BIM Management" value={modelMgmtPct} color="#1e248c" />
                <DisciplineBar label="MEP Coordination" value={superPct} color="#44b8d3" />
              </div>
              <div className="flex justify-between text-xs pt-2 border-t border-gray-100">
                <div>
                  <p className="text-gray-400">Spent vs Banked</p>
                  <p className="font-semibold text-[#1e248c]">
                    {hours ? `${Math.round(liveSpent).toLocaleString()} / ${Math.round(liveBank).toLocaleString()} hrs` : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400">{hoursLeft >= 0 ? 'Hours Left' : 'Over Budget'}</p>
                  <p className={`font-semibold ${hoursLeft >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {!hours
                      ? '—'
                      : hoursLeft >= 0
                        ? `${Math.round(hoursLeft).toLocaleString()} hrs`
                        : `${Math.round(Math.abs(hoursLeft)).toLocaleString()} hrs over`}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-auto">Click to view full analytics →</p>
            </div>

            {/* Activity & Reports */}
            <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
                  <FileText size={15} className="text-[#44b8d3]" /> Activity & Reports
                </h2>
                <span className="text-[10px] text-gray-400 font-mono">{reports.length} דוחות</span>
              </div>
              <div className="flex flex-col gap-3">
                {reports.length === 0 && (
                  <p className="text-xs text-gray-400 py-2">עדיין לא נוצרו דוחות. צרו טיוטת מייל בעמוד הדוחות והם יופיעו כאן.</p>
                )}
                {reports.map(r => (
                  <div key={r._id} className="group flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    <button
                      onClick={() => setOpenReportId(r._id)}
                      className="flex items-start gap-3 flex-1 min-w-0 text-right"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#e7eefe] flex items-center justify-center shrink-0">
                        <Mail size={14} className="text-[#1e248c]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-[#1e248c]">{r.title}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {r.recipients.length} נמענים{typeof r.issueCount === 'number' ? ` · ${r.issueCount} נושאים` : ''}{r.createdByName ? ` · ${r.createdByName}` : ''}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-gray-400">{timeAgo(r.createdAt)}</span>
                      <button
                        onClick={() => setOpenReportId(r._id)}
                        className="text-[10px] text-[#44b8d3] hover:underline"
                      >
                        צפייה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Forms & Actions — alongside Activity & Reports */}
            <FormaConnectPanel
              projectId={project._id}
              projectNumber={project.projectNumber}
              accProjectId={project.accProjectId}
              accUrl={project.links.acc}
              accExternalHub={project.accExternalHub}
            />
          </div>

          {/* Project Contacts */}
          {(project.bimManager || project.mepCoordinator || project.bimModeller) && (
            <div className="glass-card rounded-2xl p-5">
              <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2 mb-4">
                <Users size={15} className="text-[#44b8d3]" /> Project Contacts
              </h2>
              <div className="flex flex-wrap gap-6">
                {project.bimManager && (
                  <div className="flex items-center gap-3">
                    <TeamMemberCell member={project.bimManager} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{project.bimManager.name}</p>
                      <p className="text-[11px] text-gray-400">BIM Manager</p>
                    </div>
                  </div>
                )}
                {project.mepCoordinator && (
                  <div className="flex items-center gap-3">
                    <TeamMemberCell member={project.mepCoordinator} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{project.mepCoordinator.name}</p>
                      <p className="text-[11px] text-gray-400">MEP Coordinator</p>
                    </div>
                  </div>
                )}
                {project.bimModeller && (
                  <div className="flex items-center gap-3">
                    <TeamMemberCell member={project.bimModeller} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{project.bimModeller.name}</p>
                      <p className="text-[11px] text-gray-400">BIM Modeller</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {openReportId && (
        <ReportViewModal
          projectId={project._id}
          reportId={openReportId}
          onClose={() => setOpenReportId(null)}
          onDeleted={id => setReports(prev => prev.filter(r => r._id !== id))}
        />
      )}
    </div>
  )
}
