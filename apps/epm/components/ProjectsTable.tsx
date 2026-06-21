'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { LayoutGrid, FolderOpen, Cloud, Eye } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import StatusBadge from './StatusBadge'
import ProgressBar from './ProgressBar'
import TeamMemberCell from './TeamMemberCell'

type ColSource = { label?: string; board: string; column?: string }

function ColInfo({
  board, column, sources, formula, note, align = 'center',
}: { board?: string; column?: string; sources?: ColSource[]; formula?: string; note?: ReactNode; align?: 'center' | 'right' }) {
  const rows: ColSource[] = sources ?? (board ? [{ board, column }] : [])
  // Right-edge columns open leftward so the tooltip stays inside the table.
  const pos = align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
  return (
    <span className="relative group/ci cursor-default inline-flex items-center ml-1 align-middle">
      <Eye size={11} className="text-gray-300 group-hover/ci:text-gray-500 transition-colors" />
      <div className={`absolute top-full ${pos} mt-1.5 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 opacity-0 group-hover/ci:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl whitespace-nowrap normal-case font-normal text-left space-y-1`}>
        {note && <div className="text-gray-200 leading-snug">{note}</div>}
        {formula && <p className="text-gray-300 font-mono">{formula}</p>}
        {rows.map((s, i) => (
          <p key={i} className="leading-snug">
            {s.label && <span className="text-gray-400 mr-1">{s.label}:</span>}
            <span className="text-gray-500">Board</span>{' '}
            <span className="text-[#44b8d3] font-medium">{s.board}</span>
            {s.column && (
              <>
                {' · '}
                <span className="text-gray-500">Column</span>{' '}
                <span className="text-gray-300">{s.column}</span>
              </>
            )}
          </p>
        ))}
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
    <div className="rounded-2xl border border-white/80 shadow-sm">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          {/* checkbox */}
          <col className="w-8" />
          {/* Project Name — takes remaining width */}
          <col />
          {/* Proj # */}
          <col className="w-[68px]" />
          {/* Status */}
          <col className="w-[92px]" />
          {/* Milestone */}
          <col className="w-[84px]" />
          {/* Hours */}
          <col className="w-[84px]" />
          {/* BIM Mgmt */}
          <col className="w-[60px]" />
          {/* MEP Coord */}
          <col className="w-[60px]" />
          {/* BIM Modelling */}
          <col className="w-[64px]" />
          {/* Monday */}
          <col className="w-[58px]" />
          {/* Drive */}
          <col className="w-[58px]" />
          {/* ACC */}
          <col className="w-[58px]" />
        </colgroup>
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
            <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Proj #<ColInfo board="MA-004" column="מס פרויקט" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Status<ColInfo board="MA-004" column="Status" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Milestone<ColInfo note="Coming soon" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Hours<ColInfo formula="actual ÷ budget × 100" sources={[
              { label: 'Actual', board: 'TS-001/003/004/005', column: 'ש״ע (numeric)' },
              { label: 'Budget', board: 'MA-004', column: 'כמות שעות' },
            ]} /></th>
            <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">BIM<br/>Mgmt<ColInfo board="MA-003" column="Model MGMT" /></th>
            <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">MEP<br/>Coord<ColInfo board="MA-003" column="MEP Coordination" /></th>
            <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">BIM<br/>Modelling<ColInfo board="MA-003" column="Modelling / BIM Coord" align="right" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Monday<ColInfo board="MA-003" column="Main Board" note="Opens the project's main Monday board." align="right" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Drive<ColInfo note="Coming soon" align="right" /></th>
            <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">ACC<ColInfo align="right" note={
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5">
                  <Cloud size={13} className="text-[#1e248c] shrink-0" />
                  <span>EasyBIM Hub</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="relative inline-flex shrink-0">
                    <Cloud size={13} className="text-amber-500" />
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-gray-900" />
                  </span>
                  <span>External hub (client / partner)</span>
                </p>
              </div>
            } /></th>
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
                <td className="px-3 py-1.5 font-medium" dir="rtl">
                  <Link
                    href={`/dashboard/${project._id}`}
                    className="block truncate text-[#1e248c] hover:underline"
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

                {/* Monday Board — links to the project's main board (MA-003 "Main Board"),
                    falling back to the MA-004 board when no main board is set */}
                <td className="px-2 py-1.5 text-center">
                  {(() => {
                    const href = project.links.mainBoard || project.links.mondayBoard
                    return href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title={project.links.mainBoard ? 'Open main Monday board' : 'Open MA-004 board'}
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-[#1e248c] bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <LayoutGrid size={13} />
                      </a>
                    ) : (
                      <span
                        title="No Monday board linked"
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-300 bg-gray-50 cursor-not-allowed"
                      >
                        <LayoutGrid size={13} />
                      </span>
                    )
                  })()}
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

                {/* Forma / BIM360 / ACC — icon only. Amber + corner dot when the
                    linked project is outside the EasyBIM Hub (e.g. a client hub). */}
                <td className="px-2 py-1.5 text-center">
                  {project.links.acc ? (
                    <a
                      href={project.links.acc}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title={project.accExternalHub ? 'External hub — connected via MA-003' : 'Open in Autodesk ACC'}
                      className={`relative inline-flex items-center justify-center w-7 h-7 rounded transition-colors ${
                        project.accExternalHub
                          ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                          : 'text-[#1e248c] bg-indigo-50 hover:bg-indigo-100'
                      }`}
                    >
                      <Cloud size={13} />
                      {project.accExternalHub && (
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-white" />
                      )}
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
