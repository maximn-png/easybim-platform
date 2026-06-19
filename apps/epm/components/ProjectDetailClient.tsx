'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Clock,
  FileText,
  Eye,
  StickyNote,
  Users,
  BarChart2,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import StatusBadge from './StatusBadge'
import TeamMemberCell from './TeamMemberCell'
import FormaConnectPanel from './FormaConnectPanel'

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_ACTIVITIES = [
  {
    id: '1',
    icon: 'clash',
    title: 'Clash Detection Report V2',
    detail: 'MEP vs Structural clashes resolved in Level 4.',
    time: '2 hours ago',
  },
  {
    id: '2',
    icon: 'bim',
    title: 'BDQ Update – Structural',
    detail: 'Quantities updated based on latest Revit model sync.',
    time: 'Yesterday',
  },
]

const MOCK_NOTES = [
  {
    id: '1',
    source: 'bimsac.co Update',
    text: 'Client requested review of lobby material schedule.',
  },
  {
    id: '2',
    source: 'Weekly Team Summary',
    text: 'MEP coordination progressing well. Level 5 ceiling voids focus.',
  },
]

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

function DisciplineBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-[#1e248c]">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#e7eefe] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Left project nav sidebar ───────────────────────────────────────────────

function ProjectNav({ projects, activeId }: { projects: ProjectRow[]; activeId: string }) {
  return (
    <aside className="w-52 shrink-0 flex flex-col gap-1 self-start sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-2">Projects</p>
      {projects.map(p => (
        <Link
          key={p._id}
          href={`/dashboard/${p._id}`}
          className={`text-right px-3 py-2 rounded-xl text-sm font-medium truncate transition-colors ${
            p._id === activeId
              ? 'bg-[#1e248c] text-white'
              : 'text-gray-700 hover:bg-white/60'
          }`}
          dir="rtl"
        >
          {p.projectName}
        </Link>
      ))}
    </aside>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function ProjectDetailClient({
  project,
  allProjects,
}: {
  project: ProjectRow
  allProjects: ProjectRow[]
}) {
  const router = useRouter()

  // Mock discipline splits
  const bimMilestone = 20
  const mepMilestone = 60
  const overallMilestone = Math.round((bimMilestone + mepMilestone) / 2)

  const bimHoursPct = 75
  const mepHoursPct = 40
  const spentHours = project.actualHours ?? 0
  const budgetHours = project.budgetHours ?? 0
  const remainingHours = Math.max(0, budgetHours - spentHours)
  const variance = budgetHours > 0
    ? Math.round(((spentHours - budgetHours * 0.5) / (budgetHours * 0.5)) * 100)
    : 0

  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 py-8 flex gap-6">
        {/* Left nav */}
        <ProjectNav projects={allProjects} activeId={project._id} />

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
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
                  {budgetHours > 0 ? `${Math.round((spentHours / budgetHours) * 100)}%` : '—'}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                <DisciplineBar label="BIM Management" value={bimHoursPct} color="#1e248c" />
                <DisciplineBar label="MEP Coordination" value={mepHoursPct} color="#44b8d3" />
              </div>
              <div className="flex justify-between text-xs pt-2 border-t border-gray-100">
                <div>
                  <p className="text-gray-400">Spent vs Banked</p>
                  <p className="font-semibold text-[#1e248c]">
                    {spentHours.toLocaleString()} / {budgetHours.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400">Variance</p>
                  <p className={`font-semibold ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {variance >= 0 ? '+' : ''}{variance}%
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
                <button className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">
                  Filter
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {MOCK_ACTIVITIES.map(a => (
                  <div key={a.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    <div className="w-8 h-8 rounded-lg bg-[#e7eefe] flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-[#1e248c]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{a.title}</p>
                      <p className="text-[11px] text-gray-500 truncate">{a.detail}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-gray-400">{a.time}</span>
                      {project.links.acc && (
                        <a
                          href={project.links.acc}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#44b8d3] flex items-center gap-0.5 hover:underline"
                        >
                          <Eye size={10} /> View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes & Updates */}
            <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
              <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
                <StickyNote size={15} className="text-[#44b8d3]" /> Notes & Updates
              </h2>
              <div className="flex flex-col gap-3">
                {MOCK_NOTES.map(n => (
                  <div key={n.id} className="flex gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#44b8d3] mt-1.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#44b8d3] uppercase tracking-wide">{n.source}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{n.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

          {/* Forms & Actions */}
          <FormaConnectPanel
            projectId={project._id}
            projectNumber={project.projectNumber}
            accProjectId={project.accProjectId}
            accUrl={project.links.acc}
          />
        </div>
      </div>
    </div>
  )
}
