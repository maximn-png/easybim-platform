'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, FileDown, Clock, FileText } from 'lucide-react'
import type { ProjectRow, ReportListItem } from '@/lib/types'
import type { AccIssue } from '@/lib/services/apsService'
import type { GroupKey } from '@/lib/reportGrouping'
import type { ScheduleSeed } from '@/lib/scheduleTypes'
import ExportReportPanel from './ExportReportPanel'
import ScheduleReportPanel from './ScheduleReportPanel'
import ActivityReportsPanel from './ActivityReportsPanel'

// The Reports drawer: one button on the reports page, three tabs behind it —
// export now, schedule for later, and the project's report history.
//
// All three panels stay mounted while the drawer is open (inactive ones are
// display:none) so switching tabs never discards a half-filled form. The Export
// panel's rasterization nodes live in a portal for exactly that reason.

type Tab = 'export' | 'schedule' | 'activity'

export default function ReportsDrawer({
  open, onClose, project, issues, assignees, issueTypes, disciplines, allStatuses,
  groupBy, filterAssignees, filterTypes, filterDisciplines, filterStatuses,
  extraFilters, monthSel,
}: {
  open: boolean
  onClose: () => void
  project: ProjectRow
  issues: AccIssue[]
  assignees: string[]
  issueTypes: string[]
  disciplines: string[]
  allStatuses: string[]
  // Live page state, inherited by the Export tab (and seeding the Schedule form).
  groupBy: GroupKey
  filterAssignees: string[]
  filterTypes: string[]
  filterDisciplines: string[]
  filterStatuses: string[]
  extraFilters: { key: string; values: string[] }[]
  monthSel: string | null
}) {
  const [tab, setTab] = useState<Tab>('export')
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [activeSchedules, setActiveSchedules] = useState<number | null>(null)
  // Bumped on every open. Used as the panels' React key so each open starts from
  // the page's CURRENT filters (as the old modal did) — while a tab switch,
  // which doesn't bump it, keeps a half-filled form intact.
  const [openCount, setOpenCount] = useState(0)
  // Export → Schedule hand-off ("תזמן את הדוח"): the seed pre-fills the schedule
  // form; the version bump tells the panel a new hand-off happened.
  const [scheduleSeed, setScheduleSeed] = useState<ScheduleSeed | null>(null)
  const [seedVersion, setSeedVersion] = useState(0)
  const handleScheduleRequest = useCallback((seed: ScheduleSeed) => {
    setScheduleSeed(seed)
    setSeedVersion(v => v + 1)
    setTab('schedule')
  }, [])

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project._id}/reports`)
      const data = await res.json() as { reports?: ReportListItem[] }
      setReports(data.reports ?? [])
    } catch { /* the tab shows its own empty state */ }
  }, [project._id])

  useEffect(() => {
    if (!open) return
    setOpenCount(c => c + 1)
    // A hand-off never outlives the drawer session it was made in — clearing it
    // stops the remounted Schedule panel from re-opening a stale pre-filled form.
    setScheduleSeed(null)
    loadReports()
  }, [open, loadReports])

  // Lock background scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'export',   label: 'Export report',      icon: <FileDown size={14} /> },
    { id: 'schedule', label: 'Schedule report',    icon: <Clock size={14} />,
      badge: activeSchedules ? String(activeSchedules) : undefined },
    { id: 'activity', label: 'Activity & Reports', icon: <FileText size={14} />,
      badge: reports.length ? String(reports.length) : undefined },
  ]

  return (
    <div
      className={`fixed inset-0 z-[100] transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(28,32,52,0.45)', backdropFilter: 'blur(2px)' }}
        onMouseDown={onClose}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Reports"
        className={`absolute top-0 right-0 h-full w-full max-w-[1100px] bg-white shadow-2xl border-l border-[#e8eaff] flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#f0f3ff] to-white shrink-0">
          <div className="w-9 h-9 rounded-lg grid place-items-center text-white" style={{ background: 'linear-gradient(135deg,#1e248c,#44b8d3)' }}>
            <FileDown size={17} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#1e248c] leading-tight">Reports</h1>
            <p className="text-xs text-gray-500 truncate" dir="rtl">{project.projectName}</p>
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="ms-auto w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-100 shrink-0">
          {TABS.map(t => {
            const sel = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  sel
                    ? 'border-[#1e248c] text-[#1e248c] bg-[#e7eefe]/50'
                    : 'border-transparent text-gray-500 hover:text-[#1e248c] hover:bg-gray-50'
                }`}
              >
                {t.icon}
                {t.label}
                {t.badge && (
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${sel ? 'bg-[#1e248c] text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Panels — mounted only once the drawer has been opened (they fetch on
            mount); from then on all three stay mounted, with the inactive ones
            hidden, so switching tabs never discards a form. */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {openCount === 0 ? null : <>
          <div className={tab === 'export' ? '' : 'hidden'}>
            <ExportReportPanel
              key={`export-${openCount}`}
              project={project}
              issues={issues}
              allStatuses={allStatuses}
              issueTypes={issueTypes}
              disciplines={disciplines}
              assignees={assignees}
              defaultGroupBy={groupBy}
              defaultAssignees={filterAssignees}
              defaultTypes={filterTypes}
              defaultDisciplines={filterDisciplines}
              defaultStatuses={filterStatuses}
              defaultExtraFilters={extraFilters}
              defaultMonth={monthSel}
              onReportSaved={loadReports}
              onScheduleRequest={handleScheduleRequest}
            />
          </div>

          <div className={tab === 'schedule' ? '' : 'hidden'}>
            <ScheduleReportPanel
              key={`schedule-${openCount}`}
              project={project}
              issues={issues}
              assignees={assignees}
              issueTypes={issueTypes}
              disciplines={disciplines}
              allStatuses={allStatuses}
              defaultGroupBy={groupBy}
              onSchedulesChange={setActiveSchedules}
              onReportSaved={loadReports}
              seed={scheduleSeed}
              seedVersion={seedVersion}
            />
          </div>

          <div className={tab === 'activity' ? '' : 'hidden'}>
            <ActivityReportsPanel
              projectId={project._id}
              reports={reports}
              onDeleted={id => setReports(prev => prev.filter(r => r._id !== id))}
              variant="panel"
            />
          </div>
          </>}
        </div>
      </aside>
    </div>
  )
}
