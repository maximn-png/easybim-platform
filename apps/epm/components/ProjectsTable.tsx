'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, FolderOpen, Cloud, Info, Eye } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import StatusBadge from './StatusBadge'
import ProgressBar from './ProgressBar'
import TeamMemberCell from './TeamMemberCell'

function ColInfo({ board, column }: { board: string; column?: string }) {
  return (
    <span className="relative group/ci cursor-default inline-flex items-center ml-1">
      <Eye size={11} className="text-gray-300 group-hover/ci:text-gray-500 transition-colors" />
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-gray-900 text-[11px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover/ci:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl whitespace-nowrap normal-case font-normal">
        <span className="text-[#44b8d3] font-medium">{board}</span>
        {column && <span className="text-gray-400"> · {column}</span>}
      </div>
    </span>
  )
}

interface ProjectsTableProps {
  projects: ProjectRow[]
}

export default function ProjectsTable({ projects }: ProjectsTableProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (checkedIds.size === projects.length) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(projects.map(p => p._id)))
    }
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        No projects match this filter.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/80 shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-200">
            <th className="w-8 px-2 py-2">
              <input
                type="checkbox"
                checked={checkedIds.size === projects.length && projects.length > 0}
                onChange={toggleAll}
                className="rounded border-gray-300 text-[#1e248c] focus:ring-[#1e248c]"
              />
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Project Name<ColInfo board="MA-004" column="Item name" /></th>
            <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Proj #<ColInfo board="MA-004" column="text__1" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Status<ColInfo board="MA-004" column="Status" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Milestone<ColInfo board="MI-001" column="Milestone" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                Hours
                <ColInfo board="TS-001/003/004/005" column="ש״ע (numeric)" />
                <span className="relative group/hours cursor-default">
                  <Info size={12} className="text-gray-400 group-hover/hours:text-[#1e248c] transition-colors" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-gray-900 text-white text-xs rounded-xl p-3 opacity-0 group-hover/hours:opacity-100 transition-opacity pointer-events-none z-50 text-left shadow-xl normal-case font-normal">
                    <p className="font-semibold text-white mb-1.5">Hours Progress</p>
                    <p className="text-gray-300 font-mono text-[11px] mb-2">actual ÷ budget × 100</p>
                    <div className="border-t border-gray-700 pt-2 space-y-1 text-[11px] text-gray-400">
                      <p><span className="text-gray-200">Actual</span> — ש&quot;ע column · TS-001, 003, 004, 005</p>
                      <p><span className="text-gray-200">Budget</span> — MA-004 board</p>
                    </div>
                  </div>
                </span>
              </span>
            </th>
            <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">BIM<br/>Mgmt<ColInfo board="MA-003" column="Model MGMT" /></th>
            <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">MEP<br/>Coord<ColInfo board="MA-003" column="MEP Coordination" /></th>
            <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">BIM<br/>Modelling<ColInfo board="MA-003" column="Modelling / BIM Coord" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Monday</th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Drive</th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">ACC</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project, i) => {
            const isChecked = checkedIds.has(project._id)
            const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'

            return (
              <tr
                key={project._id}
                className={`border-b border-gray-100 hover:bg-blue-50/60 transition-colors ${rowBg}`}
              >
                {/* Checkbox */}
                <td className="w-8 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheck(project._id)}
                    className="rounded border-gray-300 text-[#1e248c] focus:ring-[#1e248c]"
                  />
                </td>

                {/* Project Name — RTL for Hebrew, navigates to detail page */}
                <td className="px-3 py-1.5 font-medium whitespace-nowrap max-w-[160px] truncate" dir="rtl">
                  <Link
                    href={`/dashboard/${project._id}`}
                    className="text-[#1e248c] hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    {project.projectName}
                  </Link>
                </td>

                {/* Project Number */}
                <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap text-xs">{project.projectNumber}</td>

                {/* Status */}
                <td className="px-2 py-1.5 text-center">
                  <StatusBadge status={project.status} />
                </td>

                {/* Milestone Progress */}
                <td className="px-2 py-1.5 text-center">
                  <ProgressBar value={project.milestoneProgress} />
                </td>

                {/* Hours Progress */}
                <td className="px-2 py-1.5 text-center">
                  <ProgressBar value={project.hoursProgress} />
                </td>

                {/* BIM Management */}
                <td className="px-2 py-1.5">
                  <TeamMemberCell member={project.bimManager} />
                </td>

                {/* MEP Coordination */}
                <td className="px-2 py-1.5">
                  <TeamMemberCell member={project.mepCoordinator} />
                </td>

                {/* BIM Modelling */}
                <td className="px-2 py-1.5">
                  <TeamMemberCell member={project.bimModeller} />
                </td>

                {/* Monday Board — icon only */}
                <td className="px-2 py-1.5 text-center">
                  <a
                    href={project.links.mondayBoard}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="View Monday Board"
                    className="inline-flex items-center justify-center w-7 h-7 rounded text-[#1e248c] bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <LayoutGrid size={13} />
                  </a>
                </td>

                {/* Drive Folder — icon only */}
                <td className="px-2 py-1.5 text-center">
                  <a
                    href={project.links.driveFolder}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Open Google Drive Folder"
                    className="inline-flex items-center justify-center w-7 h-7 rounded text-[#00687a] bg-teal-50 hover:bg-teal-100 transition-colors"
                  >
                    <FolderOpen size={13} />
                  </a>
                </td>

                {/* Forma / BIM360 / ACC — icon only */}
                <td className="px-2 py-1.5 text-center">
                  {project.links.acc ? (
                    <a
                      href={project.links.acc}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="Open in Autodesk ACC"
                      className="inline-flex items-center justify-center w-7 h-7 rounded text-[#1e248c] bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <Cloud size={13} />
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
