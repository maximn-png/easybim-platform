'use client'

import type { ProjectRow } from '@/lib/types'

type StatusFilter = ProjectRow['status'] | null

interface FilterTabsProps {
  activeStatus: StatusFilter
  onChange: (status: StatusFilter) => void
  counts: Record<string, number>
  totalCount: number
}

const TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',          value: null },
  { label: 'Working on it', value: 'Working on it' },
  { label: 'On Hold',      value: 'On Hold' },
  { label: 'Not Started',  value: 'Not Started' },
  { label: 'Done',         value: 'Done' },
  { label: 'Stuck',        value: 'Stuck' },
]

export default function FilterTabs({ activeStatus, onChange, counts, totalCount }: FilterTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map(tab => {
        const count = tab.value === null ? totalCount : (counts[tab.value] ?? 0)
        if (tab.value !== null && count === 0) return null  // hide empty tabs

        const isActive = activeStatus === tab.value

        return (
          <button
            key={tab.label}
            onClick={() => onChange(tab.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[#1e248c] text-white shadow-sm'
                : 'bg-white/65 border border-white/90 text-[#1e248c] hover:bg-white/90'
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className={`ml-1.5 text-[11px] ${isActive ? 'opacity-80' : 'opacity-60'}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
