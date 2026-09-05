'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, LayoutGrid, FolderOpen, Search, Filter, ArrowUp, ArrowDown,
  ImagePlus, X,
} from 'lucide-react'
import BimComposer, { ComposerProject } from './BimComposer'
import { ACCENT, ACCENT_BG } from './postMeta'

const LINKEDIN = '#0a66c2'

interface ProjectRow {
  projectNumber: string
  projectName: string
  status: string | null
  mondayUrl: string | null
  driveUrl: string | null
  publishedToLinkedIn: boolean
  inPortfolio: boolean
}

// Same Monday palette the EPM projects table uses, so a status reads the same
// in both apps.
const STATUS_STYLES: Record<string, string> = {
  'Working on it': 'bg-[#fdab3d] text-white',
  'On Hold': 'bg-[#333333] text-white',
  'Not Started': 'bg-[#784bd1] text-white',
  Done: 'bg-[#00c875] text-white',
  Stuck: 'bg-[#ba1a1a] text-white',
}

type ColKey = 'linkedin' | 'portfolio' | 'monday' | 'drive' | 'image' | 'status' | 'number' | 'name'
type SortDir = 'asc' | 'desc'

// Column order matches the table; 'image' has no sort/filter (action column).
const COLS: { key: ColKey; label: string; align: 'center' | 'right'; sortable: boolean }[] = [
  { key: 'linkedin', label: 'LinkedIn', align: 'center', sortable: true },
  { key: 'portfolio', label: 'Portfolio', align: 'center', sortable: true },
  { key: 'monday', label: 'Monday', align: 'center', sortable: true },
  { key: 'drive', label: 'Drive', align: 'center', sortable: true },
  { key: 'image', label: 'Image', align: 'center', sortable: false },
  { key: 'status', label: 'Status', align: 'center', sortable: true },
  { key: 'number', label: 'Proj #', align: 'right', sortable: true },
  { key: 'name', label: 'Project Name', align: 'right', sortable: true },
]

// The value a column exposes to sorting and to the Excel-style filter list.
function colValue(r: ProjectRow, key: ColKey): string {
  switch (key) {
    case 'linkedin': return r.publishedToLinkedIn ? 'Published' : 'Not published'
    case 'portfolio': return r.inPortfolio ? 'In portfolio' : 'Not in portfolio'
    case 'monday': return r.mondayUrl ? 'Linked' : 'Not linked'
    case 'drive': return r.driveUrl ? 'Linked' : 'Not linked'
    case 'status': return r.status ?? '—'
    case 'number': return r.projectNumber
    case 'name': return r.projectName || '(unnamed)'
    default: return ''
  }
}

export default function ProjectStatus({ agentKey, onBack }: { agentKey: string; onBack: () => void }) {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: ColKey; dir: SortDir } | null>(null)
  const [filters, setFilters] = useState<Partial<Record<ColKey, string[]>>>({})
  const [filterOpen, setFilterOpen] = useState<{ key: ColKey; left: number; top: number } | null>(null)
  const [composer, setComposer] = useState<{ project: ComposerProject | null } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/projects`, { cache: 'no-store' })
      if (res.ok) { const d = await res.json(); setRows(d.projects ?? []) }
    } catch { /* transient */ } finally { setLoading(false) }
  }, [agentKey])

  useEffect(() => { load() }, [load])

  // Search + column filters, then sort. All client-side.
  const applySearchAndFilters = useCallback((data: ProjectRow[], skipKey?: ColKey) => {
    const s = q.trim().toLowerCase()
    let out = data
    if (s) out = out.filter((r) => r.projectNumber.toLowerCase().includes(s) || r.projectName.toLowerCase().includes(s))
    for (const [key, vals] of Object.entries(filters) as [ColKey, string[]][]) {
      if (key === skipKey || !vals || vals.length === 0) continue
      const set = new Set(vals)
      out = out.filter((r) => set.has(colValue(r, key)))
    }
    return out
  }, [q, filters])

  const filtered = useMemo(() => {
    let out = applySearchAndFilters(rows)
    if (sort) {
      const { key, dir } = sort
      out = [...out].sort((a, b) => {
        const cmp = colValue(a, key).localeCompare(colValue(b, key), 'he', { numeric: true, sensitivity: 'base' })
        return dir === 'asc' ? cmp : -cmp
      })
    }
    return out
  }, [rows, sort, applySearchAndFilters])

  // Distinct values for the open filter popover — like Excel, the list reflects
  // the other active filters but not the column's own.
  const filterChoices = useMemo(() => {
    if (!filterOpen) return []
    const vals = new Set(applySearchAndFilters(rows, filterOpen.key).map((r) => colValue(r, filterOpen.key)))
    return [...vals].sort((a, b) => a.localeCompare(b, 'he', { numeric: true }))
  }, [filterOpen, rows, applySearchAndFilters])

  const anyFilter = Object.values(filters).some((v) => v && v.length > 0)

  const publishedCount = rows.filter((r) => r.publishedToLinkedIn).length
  const portfolioCount = rows.filter((r) => r.inPortfolio).length

  function cycleSort(key: ColKey) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: 'asc' }
      if (cur.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  function openFilter(key: ColKey, btn: HTMLElement) {
    const rect = btn.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left - 110, window.innerWidth - 268))
    setFilterOpen({ key, left, top: rect.bottom + 6 })
  }

  function toggleFilterValue(key: ColKey, value: string) {
    setFilters((f) => {
      const cur = f[key] ?? []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...f, [key]: next }
    })
  }

  async function toggle(projectNumber: string, field: 'publishedToLinkedIn' | 'inPortfolio', value: boolean) {
    // optimistic
    setRows((xs) => xs.map((r) => (r.projectNumber === projectNumber ? { ...r, [field]: value } : r)))
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/projects/${encodeURIComponent(projectNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      setRows((xs) => xs.map((r) => (r.projectNumber === projectNumber ? { ...r, [field]: !value } : r))) // revert
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: '#1f2430', background: 'linear-gradient(135deg,#f0f3ff 0%,#e7eefe 100%)' }}>
      {/* Full-width like the EPM projects page — the table earns the room.
          The page itself never scrolls; only the table body does, so the
          column headings stay pinned. */}
      <div style={{ padding: '20px 28px 24px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* page heading — EPM pattern */}
        <header className="flex items-end justify-between mb-5">
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <button onClick={onBack} className="hover:text-[#1e248c] cursor-pointer" style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', color: 'inherit' }}>Peacock</button>
              <span aria-hidden>›</span>
              <span className="text-[#1e248c] font-medium">Project Status</span>
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-[#1e248c] m-0">Project Status</h1>
              <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT, background: ACCENT_BG, padding: '3px 9px', borderRadius: 999 }}>{rows.length} projects</span>
            </div>
            <p className="text-gray-500 text-sm mt-1 mb-0">
              Mark which projects are published to LinkedIn and which belong in the portfolio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setComposer({ project: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer">
              <ImagePlus size={13} /> BIM Composer
            </button>
            <button onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer">
              <ArrowLeft size={13} /> Dashboard
            </button>
          </div>
        </header>

        {/* summary + search */}
        <div className="flex items-center gap-3 mb-4">
          <Summary label="Published to LinkedIn" value={publishedCount} total={rows.length} color={LINKEDIN} />
          <Summary label="In portfolio" value={portfolioCount} total={rows.length} color={ACCENT} />
          {(anyFilter || sort) && (
            <button onClick={() => { setFilters({}); setSort(null) }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
              style={{ fontSize: 12.5, color: ACCENT, background: ACCENT_BG, border: '1px solid #c9d5f0' }}>
              <X size={13} /> Clear sort &amp; filters
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto rounded-xl border border-white/80 bg-white px-3 py-2 shadow-sm">
            <Search size={15} style={{ color: '#9aa0ac' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project…"
              style={{ border: 'none', outline: 'none', fontSize: 13.5, background: 'transparent', width: 190, fontFamily: 'inherit' }} />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          /* Single scroll container (both axes) so `position: sticky` on the
             header cells pins them while rows scroll underneath. */
          <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-white/80 bg-white shadow-sm">
            {/* Percentage widths + w-full stretch the table edge-to-edge and spread
                columns proportionally as the viewport grows; min-w keeps them usable
                (and lets the wrapper scroll) on narrow screens. Project Name gets the
                largest share so long Hebrew names have room. Percentages sum to 100. */}
            <table className="table-fixed border-collapse text-sm w-full min-w-[960px]">
              <colgroup>
                <col className="w-[9%]" />{/* LinkedIn */}
                <col className="w-[9%]" />{/* Portfolio */}
                <col className="w-[7%]" />{/* Monday */}
                <col className="w-[7%]" />{/* Drive */}
                <col className="w-[6%]" />{/* Image */}
                <col className="w-[12%]" />{/* Status */}
                <col className="w-[8%]" />{/* Proj # */}
                {/* Project Name — far right so Hebrew names anchor the RTL reading edge. */}
                <col className="w-[42%]" />
              </colgroup>
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key}
                      onClick={c.sortable ? () => cycleSort(c.key) : undefined}
                      className={`sticky top-0 z-10 px-2 py-2 font-medium text-gray-600 whitespace-nowrap select-none bg-[#f6f8fc] shadow-[inset_0_-1px_0_#e5e7eb] ${c.sortable ? 'cursor-pointer hover:bg-[#eef1f8]' : ''} ${c.align === 'right' ? 'text-right' : 'text-center'}`}>
                      <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                        {c.label}
                        {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} style={{ color: ACCENT }} /> : <ArrowDown size={12} style={{ color: ACCENT }} />)}
                        {c.sortable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openFilter(c.key, e.currentTarget) }}
                            title={`Filter ${c.label}`}
                            className="rounded p-0.5 hover:bg-white"
                            style={{ color: (filters[c.key]?.length ?? 0) > 0 ? ACCENT : '#c2c0d0', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                            <Filter size={11} fill={(filters[c.key]?.length ?? 0) > 0 ? ACCENT : 'none'} />
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} className="text-center py-16 text-gray-400">
                      {q || anyFilter ? 'No projects match this filter.' : 'No projects found.'}
                    </td>
                  </tr>
                ) : filtered.map((r, i) => (
                  <tr
                    key={r.projectNumber || i}
                    className={`border-b border-gray-100 hover:bg-blue-50/60 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}`}
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex justify-center">
                        <Toggle on={r.publishedToLinkedIn} color={LINKEDIN}
                          label={`${r.projectName || r.projectNumber} — published to LinkedIn`}
                          onChange={(v) => toggle(r.projectNumber, 'publishedToLinkedIn', v)} />
                      </div>
                    </td>

                    <td className="px-2 py-1.5">
                      <div className="flex justify-center">
                        <Toggle on={r.inPortfolio} color={ACCENT}
                          label={`${r.projectName || r.projectNumber} — in portfolio`}
                          onChange={(v) => toggle(r.projectNumber, 'inPortfolio', v)} />
                      </div>
                    </td>

                    {/* Monday board — icon only; greyed, non-interactive when unlinked */}
                    <td className="px-2 py-1.5 text-center">
                      {r.mondayUrl ? (
                        <a href={r.mondayUrl} target="_blank" rel="noopener noreferrer" title="Open Monday board"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#1e248c] bg-blue-50 hover:bg-blue-100 transition-colors">
                          <LayoutGrid size={13} />
                        </a>
                      ) : (
                        <span title="No Monday board linked"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-300 bg-gray-50 cursor-not-allowed">
                          <LayoutGrid size={13} />
                        </span>
                      )}
                    </td>

                    {/* Drive folder */}
                    <td className="px-2 py-1.5 text-center">
                      {r.driveUrl ? (
                        <a href={r.driveUrl} target="_blank" rel="noopener noreferrer" title="Open Google Drive folder"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#00687a] bg-teal-50 hover:bg-teal-100 transition-colors">
                          <FolderOpen size={13} />
                        </a>
                      ) : (
                        <span title="No Google Drive folder linked"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-300 bg-gray-50 cursor-not-allowed">
                          <FolderOpen size={13} />
                        </span>
                      )}
                    </td>

                    {/* BIM Composer — create a presentation image for this project */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => setComposer({ project: { projectNumber: r.projectNumber, projectName: r.projectName } })}
                        title="Create project image (BIM Composer)"
                        className="inline-flex items-center justify-center w-7 h-7 rounded transition-colors"
                        style={{ color: ACCENT, background: ACCENT_BG, border: 'none', cursor: 'pointer' }}>
                        <ImagePlus size={13} />
                      </button>
                    </td>

                    <td className="px-2 py-1.5 text-center"><StatusBadge status={r.status} /></td>

                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap text-xs text-right">{r.projectNumber}</td>

                    {/* Project Name — RTL for Hebrew */}
                    <td className="px-2 py-1.5 font-medium" dir="rtl">
                      <span title={r.projectName} className="block truncate text-[#2b2f3a]">
                        {r.projectName || '(unnamed)'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filterOpen && (
        <FilterPopover
          left={filterOpen.left}
          top={filterOpen.top}
          choices={filterChoices}
          selected={filters[filterOpen.key] ?? []}
          onToggle={(v) => toggleFilterValue(filterOpen.key, v)}
          onClear={() => setFilters((f) => ({ ...f, [filterOpen.key]: [] }))}
          onClose={() => setFilterOpen(null)}
        />
      )}

      {composer && <BimComposer project={composer.project} onClose={() => setComposer(null)} />}
    </div>
  )
}

/** Excel-style column filter: distinct values with checkboxes, searchable when long. */
function FilterPopover({ left, top, choices, selected, onToggle, onClear, onClose }: {
  left: number; top: number
  choices: string[]
  selected: string[]
  onToggle: (v: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const visible = search.trim()
    ? choices.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()))
    : choices
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={onClose} />
      <div style={{ position: 'fixed', left, top, zIndex: 61, width: 252, background: '#fff', borderRadius: 12, border: '1px solid #dfe6f3', boxShadow: '0 10px 32px rgba(30,25,70,.16)', padding: 10 }}>
        {choices.length > 8 && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 mb-2">
            <Search size={13} style={{ color: '#9aa0ac' }} />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search values…"
              style={{ border: 'none', outline: 'none', fontSize: 12.5, width: '100%', fontFamily: 'inherit', background: 'transparent' }} />
          </div>
        )}
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <div className="text-gray-400 text-center py-4" style={{ fontSize: 12.5 }}>No values</div>
          ) : visible.map((v) => (
            <label key={v} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#f3f6fd] cursor-pointer" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={selected.includes(v)} onChange={() => onToggle(v)} style={{ accentColor: ACCENT }} />
              <span className="truncate" dir="auto" title={v}>{v}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid #f0eefa' }}>
          <span style={{ fontSize: 11.5, color: '#9aa0ac', fontWeight: 500 }}>
            {selected.length === 0 ? 'Showing all' : `${selected.length} selected`}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={onClear} className="font-semibold rounded-lg px-2 py-1 hover:bg-[#f3f6fd]" style={{ fontSize: 12, color: ACCENT, border: 'none', background: 'transparent', cursor: 'pointer' }}>Clear</button>
            <button onClick={onClose} className="font-semibold rounded-lg px-2 py-1" style={{ fontSize: 12, color: '#fff', background: ACCENT, border: 'none', cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      </div>
    </>
  )
}

function Summary({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-2.5 shadow-sm">
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 13, color: '#5a5f6e', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{value}<span style={{ color: '#b0aebc', fontWeight: 600, fontSize: 12 }}>/{total}</span></span>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  const cls = STATUS_STYLES[status] ?? 'bg-gray-400 text-white'
  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      {status}
    </span>
  )
}

function Toggle({ on, color, label, onChange }: { on: boolean; color: string; label: string; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} aria-label={label} title={label}
      style={{ border: 'none', cursor: 'pointer', padding: 0, width: 38, height: 22, borderRadius: 999, background: on ? color : '#dcdae8', position: 'relative', transition: 'background .18s' }}>
      <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 17, height: 17, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .18s' }} />
    </button>
  )
}
