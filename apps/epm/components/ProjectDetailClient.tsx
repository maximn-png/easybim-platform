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
  Trash2,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import type { ProjectRow, ReportListItem, HoursTeam } from '@/lib/types'
import StatusBadge from './StatusBadge'
import ProjectLinksBar from './ProjectLinksBar'
import TeamMemberCell from './TeamMemberCell'
import FormaConnectPanel from './FormaConnectPanel'
import ReportViewModal from './ReportViewModal'
import ProgressModal from './ProgressModal'

// Canonical subjects default to their namesake team; everything else to 'none'
// until assigned on the Hours Analytics page. Mirrors HoursAnalyticsClient.
const CANONICAL_DEFAULT: Record<string, HoursTeam> = {
  'Model MGMT':    'modelMgmt',
  'Superposition': 'superposition',
}

// Bar color per milestone discipline; anything unmapped falls back to the accent.
const MILESTONE_DISCIPLINE_COLOR: Record<string, string> = {
  bimManagement:   '#1e248c',
  mepCoordination: '#44b8d3',
  maximBain:       '#f59e0b',
}

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

function DisciplineBar({ label, spent, bank, totalBudget = null, color }: { label: string; spent: number; bank: number | null; totalBudget?: number | null; color: string }) {
  // Use the discipline's own bank when set; otherwise (the project has only a total
  // budget, no per-discipline price breakdown) fall back to the total budget so the
  // bar still shows a percentage rather than a bare hours count.
  const denom = bank != null && bank > 0 ? bank : (spent > 0 ? totalBudget : null)
  // pct may exceed 100 (over bank) — show the true % but clamp the bar fill.
  const pct = denom != null && denom > 0 ? Math.round((spent / denom) * 100) : null
  const fill = Math.min(100, Math.max(0, pct ?? 0))
  // %, when a denominator exists; bare hours only if there's no budget at all; else —.
  const display = pct !== null ? `${pct}%` : spent > 0 ? `${Math.round(spent).toLocaleString()} hrs` : '—'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-[#1e248c]">{display}</span>
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
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)
  const [progressOpen, setProgressOpen] = useState(false)

  // Progress needs two reports with issue snapshots to compare.
  const comparableReports = reports.filter(r => r.hasSnapshot).length

  async function handleDeleteReport(reportId: string) {
    if (deletingReportId) return
    if (!confirm('למחוק את הדוח? לא ניתן לשחזר.')) return
    setDeletingReportId(reportId)
    try {
      const res = await fetch(`/api/projects/${project._id}/reports/${reportId}`, { method: 'DELETE' })
      if (res.ok) {
        setReports(prev => prev.filter(r => r._id !== reportId))
      } else {
        alert('מחיקת הדוח נכשלה. נסו שוב.')
      }
    } catch {
      alert('שגיאת רשת. נסו שוב.')
    } finally {
      setDeletingReportId(null)
    }
  }

  // Milestone completion, computed during sync from MI-001-MilestonesProjects.
  // Disciplines are dynamic per project (most have BIM Management + MEP
  // Coordination; a few also have Maxim/Bain). overallMilestone is the pooled
  // completed/total across all bills.
  const milestoneDisciplines = project.milestoneDisciplines ?? []
  const overallMilestone = project.milestoneProgress
  const hasMilestones = overallMilestone != null

  // Live hours from the same source as the Hours Analytics page (Monday), so the
  // card reflects edits immediately rather than the cached snapshot.actualHours
  // (which only refreshes when the updateHours job re-runs). Subjects are routed
  // into the two disciplines via the per-project map set on the Hours Analytics
  // page (hoursConfig.subjectTeam); the headline uses ALL logged hours vs the
  // total budget, so it matches the dashboard %.
  const subjectTeam = project.hoursConfig?.subjectTeam ?? {}
  const teamFor = (subject: string): HoursTeam =>
    subjectTeam[subject] ?? CANONICAL_DEFAULT[subject] ?? 'none'

  const [hours, setHours] = useState<{
    modelMgmtSpent: number; superSpent: number; allSpent: number
    modelMgmtBank: number | null; superBank: number | null; totalBudget: number | null
  } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/projects/${project._id}/hours-breakdown`)
      .then(r => r.json())
      .then((json: {
        breakdown?: { totalsBySubject?: Record<string, number> }
        banks?: { modelMgmt: number | null; superposition: number | null; total: number | null }
      }) => {
        if (!alive) return
        const totals = json.breakdown?.totalsBySubject ?? {}
        let modelMgmtSpent = 0, superSpent = 0, allSpent = 0
        for (const [subject, h] of Object.entries(totals)) {
          allSpent += h
          const t = teamFor(subject)
          if (t === 'modelMgmt')          modelMgmtSpent += h
          else if (t === 'superposition') superSpent += h
        }
        setHours({
          modelMgmtSpent, superSpent, allSpent,
          modelMgmtBank: json.banks?.modelMgmt ?? null,
          superBank: json.banks?.superposition ?? null,
          totalBudget: json.banks?.total ?? null,
        })
      })
      .catch(() => { /* leave null → shows — */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project._id])

  // Headline = all logged hours vs the total budget (שכט סופי ÷ 300).
  const liveSpent = hours ? hours.allSpent : 0
  const liveBank  = hours ? (hours.totalBudget ?? 0) : 0
  const headlinePct = hours && liveBank > 0 ? Math.round((liveSpent / liveBank) * 100) : null
  const hoursLeft = liveBank - liveSpent // signed: negative = over budget

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
              <h1 className="text-3xl font-bold text-[#1e248c] mt-1 leading-tight text-left" dir="rtl">
                {project.projectName}
              </h1>
              <div className="mt-3">
                <ProjectLinksBar project={project} />
              </div>
            </div>
            <StatusBadge status={project.status} />
          </div>

          {/* 2×2 panel grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Milestone Status — % of bills completed, per discipline + overall */}
            <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-[#44b8d3]" /> Milestone Status
                </h2>
              </div>

              {hasMilestones ? (
                <>
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col gap-3 flex-1">
                      {milestoneDisciplines.length > 0 ? (
                        milestoneDisciplines.map(d => (
                          <DisciplineBar
                            key={d.key}
                            label={d.label}
                            spent={d.progress}
                            bank={100}
                            color={MILESTONE_DISCIPLINE_COLOR[d.key] ?? '#44b8d3'}
                          />
                        ))
                      ) : (
                        <p className="text-xs text-gray-400">No discipline breakdown</p>
                      )}
                    </div>
                    <div className="flex flex-col items-center shrink-0">
                      <MilestoneRing value={overallMilestone!} />
                      <p className="text-[10px] text-gray-400 mt-1">Overall Completed</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center py-8">
                  <p className="text-sm text-gray-400">No milestone data</p>
                </div>
              )}
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
                <DisciplineBar label="BIM Management" spent={hours?.modelMgmtSpent ?? 0} bank={hours?.modelMgmtBank ?? null} totalBudget={hours?.totalBudget ?? null} color="#1e248c" />
                <DisciplineBar label="MEP Coordination" spent={hours?.superSpent ?? 0} bank={hours?.superBank ?? null} totalBudget={hours?.totalBudget ?? null} color="#44b8d3" />
              </div>
              <div className="flex justify-between text-xs pt-2 border-t border-gray-100">
                <div>
                  <p className="text-gray-400">Spent vs Budget</p>
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
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setProgressOpen(true)}
                    disabled={comparableReports < 2}
                    title={comparableReports < 2
                      ? 'Needs at least two saved reports to compare'
                      : 'Compare issue status between reports'}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#1e248c] bg-indigo-50 hover:bg-indigo-100 disabled:text-gray-300 disabled:bg-gray-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <TrendingUp size={12} /> Progress
                  </button>
                  <span dir="rtl" className="text-[10px] text-gray-400 font-mono">{reports.length} דוחות</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {reports.length === 0 && (
                  <p dir="rtl" className="text-xs text-gray-400 py-2">עדיין לא נוצרו דוחות. צרו טיוטת מייל בעמוד הדוחות והם יופיעו כאן.</p>
                )}
                {reports.map(r => (
                  <div key={r._id} dir="rtl" className="group flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
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
                    <button
                      onClick={() => handleDeleteReport(r._id)}
                      disabled={deletingReportId === r._id}
                      title="מחק דוח"
                      className="shrink-0 self-center text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      {deletingReportId === r._id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
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
              partnerHubName={project.accHubName}
              partnerHubKey={project.accHubKey}
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

      {progressOpen && (
        <ProgressModal
          projectId={project._id}
          reports={reports}
          onClose={() => setProgressOpen(false)}
        />
      )}

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
