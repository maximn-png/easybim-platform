'use client'

// Excel-style column header menu: sort asc/desc + checkbox value filter.
// Rendered inline inside a <th>; the dropdown is absolutely positioned and
// overlays the table rows (same approach as the ColInfo tooltips).

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Filter, Search } from 'lucide-react'

export type SortDir = 'asc' | 'desc'

export interface FilterValue {
  value: string   // raw token (EMPTY sentinel for blanks)
  label: string   // display text ('(Empty)' for blanks)
  count: number
}

interface ColumnHeaderMenuProps {
  /** 'text' → A→Z labels, 'numeric' → low→high labels; omit = not sortable */
  sortKind?: 'text' | 'numeric'
  /** Active direction when this column is the current sort column */
  sortDir?: SortDir | null
  onSort?: (dir: SortDir | null) => void
  /** Distinct values (with counts) for the checkbox filter; omit = not filterable */
  values?: FilterValue[]
  /** Currently selected values; null = no filter (everything shown) */
  selected?: Set<string> | null
  onFilter?: (next: Set<string> | null) => void
  /** Which edge the dropdown anchors to, so edge columns stay inside the table */
  align?: 'left' | 'right' | 'center'
}

export default function ColumnHeaderMenu({
  sortKind, sortDir, onSort, values, selected, onFilter, align = 'center',
}: ColumnHeaderMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { if (!open) setQuery('') }, [open])

  const filterActive = selected != null
  const active = filterActive || sortDir != null
  const pos = align === 'right' ? 'right-0' : align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'

  const allValues = values ?? []
  const q = query.trim().toLowerCase()
  const shown = q ? allValues.filter(v => v.label.toLowerCase().includes(q)) : allValues

  const isChecked = (v: string) => selected == null || selected.has(v)

  const toggle = (v: string) => {
    if (!onFilter) return
    // No filter yet = everything selected; start from the full set and toggle.
    const next = new Set(selected ?? allValues.map(x => x.value))
    if (next.has(v)) next.delete(v)
    else next.add(v)
    // Everything re-selected → drop the filter entirely.
    onFilter(next.size === allValues.length ? null : next)
  }

  return (
    <span ref={rootRef} className="relative inline-flex items-center align-middle ml-0.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Sort & filter"
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
          active ? 'text-[#1e248c] bg-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        {filterActive ? <Filter size={13} className="fill-current" />
          : sortDir === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} />
          : sortDir === 'desc' ? <ArrowDown size={13} strokeWidth={2.5} />
          : <ChevronDown size={13} strokeWidth={2.5} />}
      </button>

      {open && (
        <div className={`absolute top-full ${pos} mt-1.5 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-50 text-left normal-case font-normal`}>
          {sortKind && onSort && (
            <div className="p-1.5 border-b border-gray-100">
              {([
                ['asc',  sortKind === 'numeric' ? 'Sort low → high' : 'Sort A → Z', ArrowUp],
                ['desc', sortKind === 'numeric' ? 'Sort high → low' : 'Sort Z → A', ArrowDown],
              ] as const).map(([dir, label, Icon]) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => { onSort(sortDir === dir ? null : dir); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                    sortDir === dir ? 'bg-blue-50 text-[#1e248c] font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          )}

          {values && onFilter && (
            <div className="p-1.5">
              {allValues.length > 8 && (
                <div className="relative mb-1.5">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search values..."
                    className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#1e248c]/30 placeholder-gray-400"
                  />
                </div>
              )}
              <div className="flex items-center justify-between px-2 pb-1 text-[11px]">
                <button type="button" onClick={() => onFilter(null)} className="text-[#1e248c] hover:underline">
                  Select all
                </button>
                <button type="button" onClick={() => onFilter(new Set())} className="text-gray-500 hover:underline">
                  Clear
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {shown.map(v => (
                  <label
                    key={v.value}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-xs text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked(v.value)}
                      onChange={() => toggle(v.value)}
                      className="rounded border-gray-300 text-[#1e248c] focus:ring-[#1e248c]"
                    />
                    <span className="truncate flex-1" dir="auto">{v.label}</span>
                    <span className="text-gray-400 text-[10px]">{v.count}</span>
                  </label>
                ))}
                {shown.length === 0 && (
                  <p className="px-2 py-2 text-xs text-gray-400">No matches</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
