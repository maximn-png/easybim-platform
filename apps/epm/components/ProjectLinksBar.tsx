'use client'

import { Cloud, LayoutGrid, FolderOpen } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'

// Header row of external-link pills (ACC / Monday / Drive) shown at the top of
// the project detail and reports pages. Colors and hub semantics mirror the
// dashboard table's link columns; missing links render as a disabled pill so
// the bar layout stays stable across projects.

function LinkPill({
  href,
  label,
  title,
  disabledTitle,
  icon,
  className,
  dot = false,
}: {
  href?: string
  label: string
  title: string
  disabledTitle: string
  icon: React.ReactNode
  className: string
  dot?: boolean
}) {
  if (!href) {
    return (
      <span
        title={disabledTitle}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-gray-50 cursor-not-allowed"
      >
        {icon} {label}
      </span>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${className}`}
    >
      {icon} {label}
      {dot && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-white" />
      )}
    </a>
  )
}

export default function ProjectLinksBar({ project, anaView = false }: { project: ProjectRow; anaView?: boolean }) {
  const { links, accExternalHub, accHubName } = project
  // Partner hubs (accHubName, e.g. ANA) are reachable live — only unreachable
  // external hubs keep the amber import-mode styling.
  const importHub = !!accExternalHub && !accHubName
  // Same preference order as the dashboard table's Monday column.
  const mondayHref = links.dedicatedBoard || links.mainBoard || links.mondayBoard || undefined
  const mondayTitle = links.dedicatedBoard
    ? 'Open dedicated Monday board'
    : links.mainBoard ? 'Open main Monday board' : 'Open MA-004 board'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <LinkPill
        href={links.acc}
        label={accHubName ? `ACC · ${accHubName}` : 'ACC'}
        title={
          accHubName ? `${accHubName} — external hub connected via API`
          : importHub ? 'External hub — connected via MA-003'
          : 'Open in Autodesk ACC'
        }
        disabledTitle="No ACC project linked"
        icon={<Cloud size={13} />}
        className={
          accHubName
            ? 'text-cyan-700 bg-cyan-50 hover:bg-cyan-100'
            : importHub
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
              : 'text-[#1e248c] bg-indigo-50 hover:bg-indigo-100'
        }
        dot={importHub}
      />
      {/* Monday + Drive are internal-only links — hidden in the ANA client view. */}
      {!anaView && (
        <>
          <LinkPill
            href={mondayHref}
            label="Monday"
            title={mondayTitle}
            disabledTitle="No Monday board linked"
            icon={<LayoutGrid size={13} />}
            className="text-[#1e248c] bg-blue-50 hover:bg-blue-100"
          />
          <LinkPill
            href={links.driveFolder || undefined}
            label="Drive"
            title="Open Google Drive folder"
            disabledTitle="No Google Drive folder linked"
            icon={<FolderOpen size={13} />}
            className="text-[#00687a] bg-teal-50 hover:bg-teal-100"
          />
        </>
      )}
    </div>
  )
}
