'use client'

import { X, ExternalLink, LayoutGrid, FolderOpen, Cloud, AlertCircle } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import StatusBadge from './StatusBadge'
import ProgressBar from './ProgressBar'
import TeamMemberCell from './TeamMemberCell'

interface ProjectSidebarProps {
  project: ProjectRow | null
  onClose: () => void
}

function SidebarRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}

export default function ProjectSidebar({ project, onClose }: ProjectSidebarProps) {
  if (!project) return null

  return (
    <aside className="w-72 shrink-0 glass-card rounded-2xl p-5 flex flex-col gap-4 self-start sticky top-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-[#44b8d3] uppercase tracking-wide">Project #{project.projectNumber}</p>
          <h2 className="font-bold text-[#1e248c] text-base mt-0.5 leading-snug" dir="rtl">
            {project.projectName}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Status */}
      <SidebarRow label="Status">
        <StatusBadge status={project.status} />
      </SidebarRow>

      {/* Progress */}
      <SidebarRow label="Milestone">
        <ProgressBar value={project.milestoneProgress} />
      </SidebarRow>
      <SidebarRow label="Hours">
        <ProgressBar value={project.hoursProgress} />
      </SidebarRow>

      {/* Team */}
      {(project.bimManager || project.mepCoordinator || project.bimModeller) && (
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Team</p>
          <div className="flex flex-col gap-2">
            {project.bimManager && (
              <div className="flex items-center gap-2">
                <TeamMemberCell member={project.bimManager} />
                <div>
                  <p className="text-xs font-medium text-gray-700">{project.bimManager.name}</p>
                  <p className="text-[10px] text-gray-400">BIM Management</p>
                </div>
              </div>
            )}
            {project.mepCoordinator && (
              <div className="flex items-center gap-2">
                <TeamMemberCell member={project.mepCoordinator} />
                <div>
                  <p className="text-xs font-medium text-gray-700">{project.mepCoordinator.name}</p>
                  <p className="text-[10px] text-gray-400">MEP Coordination</p>
                </div>
              </div>
            )}
            {project.bimModeller && (
              <div className="flex items-center gap-2">
                <TeamMemberCell member={project.bimModeller} />
                <div>
                  <p className="text-xs font-medium text-gray-700">{project.bimModeller.name}</p>
                  <p className="text-[10px] text-gray-400">BIM Modelling</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACC issues */}
      {project.openIssuesCount !== null && project.openIssuesCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <span className="text-xs text-red-700 font-medium">{project.openIssuesCount} open issues in ACC</span>
        </div>
      )}

      {/* Links */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Links</p>
        <a
          href={project.links.mondayBoard}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-[#1e248c] hover:underline"
        >
          <LayoutGrid size={13} /> Monday Board <ExternalLink size={10} className="opacity-50" />
        </a>
        <a
          href={project.links.driveFolder}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-[#00687a] hover:underline"
        >
          <FolderOpen size={13} /> Google Drive Folder <ExternalLink size={10} className="opacity-50" />
        </a>
        {project.links.acc && (
          <a
            href={project.links.acc}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-[#1e248c] hover:underline"
          >
            <Cloud size={13} /> Autodesk ACC <ExternalLink size={10} className="opacity-50" />
          </a>
        )}
      </div>

      {/* Sync status */}
      {project.sync.syncStatus !== 'never' && (
        <p className="text-[10px] text-gray-400 mt-auto">
          Last synced: {project.sync.lastSyncedAt
            ? new Date(project.sync.lastSyncedAt).toLocaleString()
            : 'never'}
        </p>
      )}
    </aside>
  )
}
