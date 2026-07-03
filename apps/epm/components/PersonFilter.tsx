'use client'

import { UserRound, X } from 'lucide-react'

export interface FilterPerson {
  name: string
  avatarUrl?: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

interface PersonFilterProps {
  people: FilterPerson[]
  selected: string | null
  onSelect: (name: string | null) => void
}

// Quick "filter this board by person" — click a face to show only projects the
// person is assigned to (in any role). Mirrors TeamMemberCell avatar styling.
export default function PersonFilter({ people, selected, onSelect }: PersonFilterProps) {
  if (people.length === 0) return null

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 shrink-0">
        <UserRound size={14} className="text-[#1e248c]" />
        <span className="hidden sm:inline">Filter by person</span>
      </span>

      <div className="flex items-center gap-1 overflow-x-auto py-0.5">
        {people.map(p => {
          const isSelected = selected === p.name
          const dim = selected !== null && !isSelected
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => onSelect(isSelected ? null : p.name)}
              title={p.name}
              aria-pressed={isSelected}
              className={`shrink-0 rounded-full transition-all ${
                isSelected ? 'ring-2 ring-[#1e248c] ring-offset-1' : 'hover:ring-2 hover:ring-[#1e248c]/30'
              } ${dim ? 'opacity-40 hover:opacity-100' : ''}`}
            >
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatarUrl} alt={p.name} className="w-7 h-7 rounded-full object-cover block" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#e8eaff] border border-[#c5caff] flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-[#1e248c]">{getInitials(p.name)}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          title="Clear person filter"
          className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-[#1e248c] transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  )
}
