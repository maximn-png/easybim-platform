import type { ProjectRow } from '@/lib/types'

const STATUS_STYLES: Record<NonNullable<ProjectRow['status']>, string> = {
  'Working on it': 'bg-[#fdab3d] text-white',
  'On Hold':       'bg-[#333333] text-white',
  'Not Started':   'bg-[#784bd1] text-white',
  'Done':          'bg-[#00c875] text-white',
  'Stuck':         'bg-[#ba1a1a] text-white',
}

interface StatusBadgeProps {
  status: ProjectRow['status']
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}
