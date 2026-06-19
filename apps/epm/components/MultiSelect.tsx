'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

// ── Multi-select dropdown ───────────────────────────────────────────────────
// Checkbox dropdown that lets the user pick several values at once.
// `renderLabel` lets callers display e.g. a status label while keeping raw values.
export default function MultiSelect({
  placeholder, options, selected, onChange, renderLabel, size = 'md',
}: {
  placeholder: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  renderLabel?: (v: string) => string
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const label = (v: string) => (renderLabel ? renderLabel(v) : v)
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  const summary =
    selected.length === 0 ? placeholder
    : selected.length === 1 ? label(selected[0])
    : `${selected.length} selected`

  const pad = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-sm'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20 ${pad} ${
          selected.length ? 'border-[#1e248c]/40 text-[#1e248c] font-medium' : 'border-gray-200 text-gray-600'
        }`}
      >
        <span className="truncate max-w-[140px]">{summary}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 min-w-[180px] max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          <div className="flex items-center justify-between px-3 py-1 border-b border-gray-100 mb-1">
            <button
              onClick={() => onChange(options.slice())}
              className="text-[10px] text-[#1e248c] hover:underline"
            >Select all</button>
            <button
              onClick={() => onChange([])}
              className="text-[10px] text-gray-400 hover:text-red-500"
            >Clear</button>
          </div>
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50/60 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => toggle(o)}
                className="accent-[#1e248c]"
              />
              <span className="truncate" title={label(o)}>{label(o)}</span>
            </label>
          ))}
          {options.length === 0 && <p className="px-3 py-2 text-[11px] text-gray-400">No options</p>}
        </div>
      )}
    </div>
  )
}
