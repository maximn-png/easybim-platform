'use client'

import Link from 'next/link'
import { useEffect, useState, useMemo, useRef, type ReactNode } from 'react'
import {
  ChevronRight, Filter, X, FileDown, AlertCircle, Loader2,
  ArrowUp, ArrowDown, ArrowUpDown, Settings2,
} from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import type { AccIssue } from '@/lib/services/apsService'
import {
  buildGroupOptions, groupLabelFor, type GroupKey, groupValue, paramValue, issueMonthKey,
  statusColor, statusLabel, segmentTextColor,
} from '@/lib/reportGrouping'

// The reports page always defaults its "Stack by" to the project's discipline
// dimension (as it was before). These labels identify it across ACC naming
// conventions, incl. the Hebrew "תחום" used on imported projects.
const DISCIPLINE_LABELS = ['discipline', 'disciplines', 'תחום', 'דיסציפלינה', 'משמעת']
// The dedicated Discipline column already surfaces the "Discipline" attribute, so
// it isn't repeated as an extra table column / any-param filter option.
const DISCIPLINE_FIELD_TITLES = ['discipline', 'disciplines']
import IssuesByMonthChart from './IssuesByMonthChart'
import MultiSelect from './MultiSelect'
import ExportReportModal from './ExportReportModal'
import ProjectLinksBar from './ProjectLinksBar'

// Readable pill text colour: light pastels get a dark gray, saturated colours keep their hue.
function badgeTextColor(s: string) {
  const hex = statusColor(s).replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#4b5563' : statusColor(s)
}

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Helpers ────────────────────────────────────────────────────────────────

function Breadcrumb({ project, anaView = false }: { project: ProjectRow; anaView?: boolean }) {
  if (anaView) {
    return (
      <nav className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <Link href="/ana" className="hover:text-[#1e248c]">ANA Projects</Link>
        <ChevronRight size={12} />
        <Link href={`/ana/${project._id}`} className="hover:text-[#1e248c]" dir="rtl">{project.projectName}</Link>
        <ChevronRight size={12} />
        <span className="text-[#1e248c] font-medium">Reports</span>
      </nav>
    )
  }
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500 mb-1">
      <Link href="/dashboard" className="hover:text-[#1e248c]">Dashboard</Link>
      <ChevronRight size={12} />
      <Link href="/dashboard" className="hover:text-[#1e248c]">EPM</Link>
      <ChevronRight size={12} />
      <Link href={`/dashboard/${project._id}`} className="hover:text-[#1e248c]" dir="rtl">{project.projectName}</Link>
      <ChevronRight size={12} />
      <span className="text-[#1e248c] font-medium">Reports</span>
    </nav>
  )
}

// Group KPI card
function GroupCard({ name, count, total }: { name: string; count: number; total: number }) {
  const initials = (name === 'Unassigned' || name === 'No Discipline')
    ? '?'
    : name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const pct = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="w-8 h-8 rounded-full bg-[#e7eefe] flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-[#1e248c]">{initials}</span>
        </div>
        <span className="text-2xl font-bold text-[#1e248c]">{String(count).padStart(2, '0')}</span>
      </div>
      <p className="text-xs text-gray-500 truncate" title={name}>{name}</p>
      <div className="w-full h-1 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#1e248c]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-gray-400">{pct}% of total</p>
    </div>
  )
}

// Stacked bar row — one per group, sub-stacked by status.
// Bar length is proportional to the group's share of the largest group (maxTotal),
// so groups with more issues render visibly longer. Every non-empty status segment
// shows its count: centred inside the colour, overflowing slightly when the segment
// is too narrow (a dark halo keeps it legible over any neighbouring colour).
function GroupBar({
  name, issues, allStatuses, maxTotal, selected, onSelect,
}: {
  name: string
  issues: AccIssue[]
  allStatuses: string[]
  maxTotal: number
  selected: { group: string; status?: string } | null
  onSelect: (group: string, status?: string) => void
}) {
  const total = issues.length
  if (total === 0) return null

  // Only non-empty status segments, with cumulative centre for label placement.
  let acc = 0
  const segs = allStatuses
    .map(s => ({ s, c: issues.filter(i => i.status === s).length }))
    .filter(x => x.c > 0)
    .map(({ s, c }) => {
      const w = (c / total) * 100
      const center = acc + w / 2
      acc += w
      return { s, c, w, center }
    })

  const fillPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0
  const isGroupSel = selected?.group === name
  const dim = selected != null && !isGroupSel // fade non-selected groups

  return (
    <div className={`flex items-center gap-3 transition-opacity ${dim ? 'opacity-40 hover:opacity-100' : ''}`}>
      <button
        onClick={() => onSelect(name)}
        title={`Filter the table by ${name}`}
        className={`text-xs w-32 shrink-0 truncate text-left cursor-pointer hover:text-[#1e248c] transition-colors ${isGroupSel && !selected?.status ? 'text-[#1e248c] font-semibold' : 'text-gray-600'}`}
      >
        {name}
      </button>
      {/* Track spans full width; the filled portion scales with group size */}
      <div className="relative flex-1 h-5 rounded-full bg-gray-100">
        {/* Colour layer (clipped, rounded) */}
        <div className="flex h-full rounded-full overflow-hidden" style={{ width: `${fillPct}%` }}>
          {segs.map(({ s, w }) => {
            const segSel = isGroupSel && selected?.status === s
            return (
              <div
                key={s}
                onClick={() => onSelect(name, s)}
                className="h-full cursor-pointer"
                style={{
                  width: `${w}%`, background: statusColor(s),
                  outline: segSel ? '2px solid #1e248c' : 'none', outlineOffset: '-2px',
                }}
                title={`${statusLabel(s)}: ${issues.filter(i => i.status === s).length} — click to filter the table`}
              />
            )
          })}
        </div>
        {/* Label overlay — aligned to the filled portion; overflow-visible so narrow
            segments still show their count just aside. pointer-events-none lets
            clicks fall through to the colour segments underneath. */}
        <div className="absolute top-0 left-0 h-full pointer-events-none" style={{ width: `${fillPct}%` }}>
          {segs.map(({ s, c, center }) => (
            <span
              key={s}
              className="absolute top-1/2 text-[9px] font-bold leading-none whitespace-nowrap"
              style={{ left: `${center}%`, transform: 'translate(-50%,-50%)', color: '#fff', textShadow: '0 0 2px rgba(0,0,0,0.85)' }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      <span className="text-xs text-gray-500 w-7 text-right shrink-0 font-medium tabular-nums">{total}</span>
    </div>
  )
}

// ── Table column model ──────────────────────────────────────────────────────
// A column knows how to sort, render, and (optionally) filter itself, so the
// table body/header/filter row can be driven entirely by the visible-column list.
type ColFilter =
  | { type: 'text'; rtl?: boolean; placeholder?: string }
  | { type: 'multiselect'; options: string[]; optionValue: (i: AccIssue) => string; renderLabel?: (v: string) => string }

interface ColDef {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  optional?: boolean          // hidden by default; toggled via the gear menu
  cellClass?: string
  rtl?: boolean
  sortValue: (i: AccIssue) => string
  render: (i: AccIssue) => ReactNode
  cellTitle?: (i: AccIssue) => string
  filter?: ColFilter
}

// Columns shown out of the box (order matters).
const DEFAULT_COLS = [
  'displayId', 'title', 'assignedTo', 'discipline', 'description',
  'status', 'issueType', 'createdAt', 'createdBy',
]

// ── Main component ────────────────────────────────────────────────────────

export default function BimReportClient({ project, anaView = false }: { project: ProjectRow; anaView?: boolean }) {
  // Partner-hub projects (accHubName set, e.g. ANA) use the live API like
  // EasyBIM-hub ones — only unreachable external hubs are import-based.
  const isExternal = !!project.accExternalHub && !project.accHubName
  const [issues, setIssues] = useState<AccIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noAcc, setNoAcc] = useState(false)
  const [needsImport, setNeedsImport] = useState(false)
  const [needsApsAuth, setNeedsApsAuth] = useState(false)

  // Global filters (affect charts + table) — multi-select
  const [filterAssignees, setFilterAssignees] = useState<string[]>([])
  const [filterTypes, setFilterTypes] = useState<string[]>([])
  const [filterDisciplines, setFilterDisciplines] = useState<string[]>([])
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  // Ad-hoc "filter by any parameter" rows (Due Date, Created By, custom attrs).
  const [extraFilters, setExtraFilters] = useState<{ key: string; values: string[] }[]>([])
  const [selectedIssue, setSelectedIssue] = useState<AccIssue | null>(null)
  const [groupBy, setGroupBy] = useState<GroupKey>('discipline')
  // Click-to-filter from the discipline bars: a chosen group (+ optional status).
  const [chartSel, setChartSel] = useState<{ group: string; status?: string } | null>(null)
  // Click-to-filter from the month chart: a page-wide month filter (YYYY-MM).
  const [monthSel, setMonthSel] = useState<string | null>(null)

  // Per-column table filters (affect table only) — keyed by column key.
  const [colText, setColText] = useState<Record<string, string>>({})
  const [colSel, setColSel] = useState<Record<string, string[]>>({})

  // Visible table columns (persisted per project via localStorage).
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_COLS)
  const [gearOpen, setGearOpen] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)

  // Table sorting — default to the ACC issue number, ascending.
  const [sortCol, setSortCol] = useState<string | null>('displayId')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Export Report modal
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${project._id}/issues`)
      .then(async r => {
        const data = await r.json() as {
          issues?: AccIssue[]
          noAccProject?: boolean
          needsImport?: boolean
          needsApsAuth?: boolean
          error?: string
          mock?: boolean
        }
        if (data.needsApsAuth) { setNeedsApsAuth(true); return }
        if (data.needsImport) { setNeedsImport(true); return }
        if (data.noAccProject) { setNoAcc(true); return }
        if (data.error) { setError(data.error); return }
        setIssues(data.issues ?? [])
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [project._id])

  // Load / persist the visible-column choice per project.
  const colsInited = useRef(false)
  useEffect(() => {
    if (colsInited.current) return
    colsInited.current = true
    try {
      const raw = localStorage.getItem(`epm.reportCols.${project._id}`)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length) setVisibleKeys(arr)
      }
    } catch { /* ignore */ }
  }, [project._id])
  useEffect(() => {
    try { localStorage.setItem(`epm.reportCols.${project._id}`, JSON.stringify(visibleKeys)) } catch { /* ignore */ }
  }, [visibleKeys, project._id])

  // Close the gear menu on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Normalize assignedTo — null/empty → 'Unassigned'
  const normalizedIssues = useMemo(() =>
    issues.map(i => ({ ...i, assignedTo: i.assignedTo?.trim() || 'Unassigned' })),
    [issues]
  )

  // Stack-by options are dynamic: base dimensions + every ACC custom attribute
  // present on this project's issues (Discipline, Phase, …) + Due Date.
  const groupOptions = useMemo(() => buildGroupOptions(normalizedIssues), [normalizedIssues])
  const groupLabel = groupLabelFor(groupBy, groupOptions)

  // Always default the stack-by to the project's discipline dimension, for every
  // project type. No persistence — every visit starts on discipline (as before);
  // the user can still switch it for the current view. Falls back to Assigned To
  // only if a project genuinely has no discipline attribute.
  const stackInited = useRef(false)
  useEffect(() => {
    if (stackInited.current || normalizedIssues.length === 0) return
    stackInited.current = true
    const discipline = groupOptions.find(o =>
      o.value.startsWith('attr:') && DISCIPLINE_LABELS.includes(o.label.trim().toLowerCase())
    )
    setGroupBy(discipline ? discipline.value : 'assignedTo')
  }, [normalizedIssues, groupOptions])

  // Unique filter options
  const assignees = useMemo(() =>
    [...new Set(normalizedIssues.map(i => i.assignedTo!))].sort(),
    [normalizedIssues]
  )
  const issueTypes = useMemo(() =>
    [...new Set(normalizedIssues.map(i => i.issueType))].filter(Boolean).sort(),
    [normalizedIssues]
  )
  const disciplines = useMemo(() =>
    [...new Set(normalizedIssues.map(i => i.discipline?.trim() || 'No Discipline'))].sort(),
    [normalizedIssues]
  )
  const allStatuses = useMemo(() =>
    [...new Set(normalizedIssues.map(i => i.status))].filter(Boolean),
    [normalizedIssues]
  )

  // Custom-attribute titles present on the issues (excluding the one that already
  // feeds the dedicated Discipline column), for extra table columns + any-param filters.
  const attrTitles = useMemo(() => {
    const s = new Set<string>()
    for (const i of normalizedIssues) {
      if (i.attributes) for (const k of Object.keys(i.attributes)) {
        const t = k.trim()
        if (t && !DISCIPLINE_FIELD_TITLES.includes(t.toLowerCase())) s.add(t)
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [normalizedIssues])

  // "Filter by any parameter" — every dimension not already a fixed filter row.
  const allParamOptions = useMemo(
    () => [...groupOptions, { value: 'createdBy', label: 'Created By' }],
    [groupOptions]
  )
  const FIXED_PARAM_KEYS = new Set(['assignedTo', 'status', 'issueType'])
  const extraParamOptions = useMemo(() =>
    allParamOptions.filter(o =>
      !FIXED_PARAM_KEYS.has(o.value) &&
      !(o.value.startsWith('attr:') && DISCIPLINE_LABELS.includes(o.label.trim().toLowerCase())) &&
      !extraFilters.some(f => f.key === o.value)
    ),
    [allParamOptions, extraFilters]
  )
  const paramLabel = (key: string) => allParamOptions.find(o => o.value === key)?.label
    ?? (key.startsWith('attr:') ? key.slice(5) : key)
  const valuesForParam = (key: string): string[] =>
    [...new Set(normalizedIssues.map(i => paramValue(i, key)))].filter(Boolean).sort((a, b) => a.localeCompare(b))

  // Global-filtered issues (drive charts + table). Empty selection = no filter.
  const filtered = useMemo(() => normalizedIssues.filter(i => {
    if (filterAssignees.length && !filterAssignees.includes(i.assignedTo!)) return false
    if (filterTypes.length && !filterTypes.includes(i.issueType)) return false
    if (filterDisciplines.length && !filterDisciplines.includes(i.discipline?.trim() || 'No Discipline')) return false
    if (filterStatuses.length && !filterStatuses.includes(i.status)) return false
    for (const f of extraFilters) {
      if (f.values.length && !f.values.includes(paramValue(i, f.key))) return false
    }
    if (monthSel && issueMonthKey(i.createdAt) !== monthSel) return false
    return true
  }), [normalizedIssues, filterAssignees, filterTypes, filterDisciplines, filterStatuses, extraFilters, monthSel])

  // A discipline-bar selection is only meaningful for the current grouping / filters.
  useEffect(() => { setChartSel(null) }, [groupBy, filterAssignees, filterTypes, filterDisciplines, filterStatuses, extraFilters, monthSel])

  // Group by the chosen dimension for bars + top cards
  const grouped = useMemo(() => {
    const map = new Map<string, AccIssue[]>()
    for (const issue of filtered) {
      const key = groupValue(issue, groupBy)
      map.set(key, [...(map.get(key) ?? []), issue])
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered, groupBy])

  // Top 6 groups for KPI cards
  const topGroups = grouped.slice(0, 6)
  const totalFiltered = filtered.length
  // Largest group size — used to scale the bar lengths proportionally
  const maxGroupTotal = grouped.length > 0 ? grouped[0][1].length : 0

  // ── Column registry ────────────────────────────────────────────────────────
  const columns: ColDef[] = useMemo(() => {
    const base: ColDef[] = [
      {
        key: 'displayId', label: '#', cellClass: 'font-mono whitespace-nowrap',
        sortValue: i => String(parseInt(i.displayId ?? '', 10) || 0).padStart(12, '0'),
        render: i => (
          i.url
            ? <a href={i.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open this issue in ACC" className="text-[#1e248c] hover:text-[#44b8d3] hover:underline">#{i.displayId ?? '—'}</a>
            : <span className="text-gray-500">#{i.displayId ?? '—'}</span>
        ),
      },
      {
        key: 'title', label: 'Title', cellClass: 'font-medium text-gray-800 max-w-[200px] truncate',
        cellTitle: i => i.title,
        sortValue: i => i.title.toLowerCase(),
        render: i => i.title,
        filter: { type: 'text' },
      },
      {
        key: 'assignedTo', label: 'Assigned To', cellClass: 'text-gray-600',
        sortValue: i => (i.assignedTo ?? '').toLowerCase(),
        render: i => i.assignedTo ?? '—',
        filter: { type: 'multiselect', options: assignees, optionValue: i => i.assignedTo ?? 'Unassigned' },
      },
      {
        key: 'discipline', label: 'Discipline', cellClass: 'text-gray-600',
        sortValue: i => (i.discipline ?? '').toLowerCase(),
        render: i => i.discipline || '—',
        filter: { type: 'multiselect', options: disciplines, optionValue: i => i.discipline?.trim() || 'No Discipline' },
      },
      {
        key: 'description', label: 'Description', align: 'right', rtl: true,
        cellClass: 'text-gray-500 max-w-[240px] truncate text-right',
        cellTitle: i => i.description,
        sortValue: i => (i.description ?? '').toLowerCase(),
        render: i => i.description || '—',
        filter: { type: 'text', rtl: true, placeholder: 'סינון…' },
      },
      {
        key: 'status', label: 'Status', align: 'center', cellClass: 'text-center',
        sortValue: i => statusLabel(i.status).toLowerCase(),
        render: i => (
          <span className="inline-block text-[10px] rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap"
            style={{ background: statusColor(i.status), color: segmentTextColor(i.status) }}>
            {statusLabel(i.status)}
          </span>
        ),
        filter: { type: 'multiselect', options: allStatuses, optionValue: i => i.status, renderLabel: statusLabel },
      },
      {
        key: 'issueType', label: 'Type', cellClass: 'text-gray-600',
        sortValue: i => (i.issueType ?? '').toLowerCase(),
        render: i => i.issueType,
        filter: { type: 'multiselect', options: issueTypes, optionValue: i => i.issueType },
      },
      {
        key: 'createdAt', label: 'Created', cellClass: 'text-gray-400 whitespace-nowrap',
        sortValue: i => i.createdAt,
        render: i => fmtDate(i.createdAt),
      },
      {
        key: 'createdBy', label: 'Created By', cellClass: 'text-gray-600 whitespace-nowrap',
        sortValue: i => (i.createdBy ?? '').toLowerCase(),
        render: i => i.createdBy ?? '—',
      },
      // ── Optional (hidden by default) ──
      {
        key: 'dueDate', label: 'Due Date', optional: true, cellClass: 'text-gray-400 whitespace-nowrap',
        sortValue: i => i.dueDate ?? '',
        render: i => fmtDate(i.dueDate),
      },
      {
        key: 'updatedAt', label: 'Updated', optional: true, cellClass: 'text-gray-400 whitespace-nowrap',
        sortValue: i => i.updatedAt ?? '',
        render: i => fmtDate(i.updatedAt),
      },
      {
        key: 'closedAt', label: 'Closed', optional: true, cellClass: 'text-gray-400 whitespace-nowrap',
        sortValue: i => i.closedAt ?? '',
        render: i => fmtDate(i.closedAt),
      },
    ]
    // One optional column per custom ACC attribute present on the issues.
    const attrCols: ColDef[] = attrTitles.map(t => ({
      key: `attr:${t}`, label: t, optional: true, cellClass: 'text-gray-600',
      sortValue: i => (i.attributes?.[t] ?? '').toLowerCase(),
      render: i => i.attributes?.[t] || '—',
      filter: {
        type: 'multiselect',
        options: [...new Set(normalizedIssues.map(i => i.attributes?.[t]?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
        optionValue: i => i.attributes?.[t]?.trim() || '',
      },
    }))
    return [...base, ...attrCols]
  }, [assignees, disciplines, allStatuses, issueTypes, attrTitles, normalizedIssues])

  const visibleColumns = useMemo(
    () => columns.filter(c => visibleKeys.includes(c.key)),
    [columns, visibleKeys]
  )

  // ── Table: per-column filters + sorting (applied on top of global filters) ──
  const tableRows = useMemo(() => {
    const rows = filtered.filter(i => {
      // Discipline-bar click-to-filter: restrict to the selected group (+ status).
      if (chartSel) {
        if (groupValue(i, groupBy) !== chartSel.group) return false
        if (chartSel.status && i.status !== chartSel.status) return false
      }
      for (const col of columns) {
        const f = col.filter
        if (!f) continue
        if (f.type === 'text') {
          const q = (colText[col.key] ?? '').toLowerCase()
          if (q && !col.sortValue(i).includes(q)) return false
        } else {
          const sel = colSel[col.key] ?? []
          if (sel.length && !sel.includes(f.optionValue(i))) return false
        }
      }
      return true
    })
    if (sortCol) {
      const col = columns.find(c => c.key === sortCol)
      if (col) {
        rows.sort((a, b) => {
          const av = col.sortValue(a), bv = col.sortValue(b)
          const cmp = av < bv ? -1 : av > bv ? 1 : 0
          return sortDir === 'asc' ? cmp : -cmp
        })
      }
    }
    return rows
  }, [filtered, columns, colText, colSel, sortCol, sortDir, chartSel, groupBy])

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col); setSortDir('asc')
    }
  }

  const hasGlobalFilters =
    filterAssignees.length > 0 || filterTypes.length > 0 || filterDisciplines.length > 0 ||
    filterStatuses.length > 0 || extraFilters.some(f => f.values.length > 0) || monthSel != null
  const hasColFilters =
    Object.values(colText).some(Boolean) || Object.values(colSel).some(v => v.length > 0)

  const clearGlobalFilters = () => {
    setFilterAssignees([]); setFilterTypes([]); setFilterDisciplines([])
    setFilterStatuses([]); setExtraFilters([]); setMonthSel(null); setSelectedIssue(null)
  }
  const clearColFilters = () => { setColText({}); setColSel({}) }
  const selectMonth = (mk: string) => { setMonthSel(prev => (prev === mk ? null : mk)); setSelectedIssue(null) }

  // Sortable column header button
  const SortHeader = ({ col, label, align = 'left' }: { col: string; label: string; align?: 'left' | 'center' | 'right' }) => (
    <th className={`px-4 py-2.5 font-medium text-gray-500 ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-1 hover:text-[#1e248c] transition-colors ${sortCol === col ? 'text-[#1e248c]' : ''}`}
      >
        {label}
        {sortCol !== col
          ? <ArrowUpDown size={11} className="opacity-30" />
          : sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      </button>
    </th>
  )

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-4rem)]" style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}>
      <div className="max-w-[1400px] mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Breadcrumb project={project} anaView={anaView} />
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="text-3xl font-bold text-[#1e248c]">
                Reports –{' '}
                <span dir="rtl" className="inline-block">{project.projectName}</span>
              </h1>
              <span className="text-sm font-bold px-2.5 py-1 rounded-full bg-white/70 border border-[#1e248c]/15 text-[#1e248c] whitespace-nowrap">
                #{anaView ? (project.ana?.number || '—') : project.projectNumber}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Project Status Update · Generated {today}</p>
            <div className="mt-3">
              <ProjectLinksBar project={project} anaView={anaView} />
            </div>
          </div>
          {/* Internal-only actions — hidden for the ANA client view. */}
          {!anaView && (
            <div className="flex items-center gap-3 self-start flex-wrap">
              {!isExternal && (
                <a
                  href={`/api/auth/autodesk/disconnect?returnTo=/dashboard/${project._id}/reports${project.accHubKey ? `&hub=${project.accHubKey}` : ''}`}
                  className="text-xs text-gray-400 hover:text-[#1e248c] underline underline-offset-2 transition-colors"
                  title="Clear token and re-authenticate with Autodesk"
                >
                  Reconnect Autodesk
                </a>
              )}
              <button
                onClick={() => setExportOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1e248c] text-white rounded-xl text-sm font-medium hover:bg-[#44b8d3] transition-colors shadow-sm"
              >
                <FileDown size={15} /> Export Report
              </button>
            </div>
          )}
        </div>

        {/* Filter bar */}
        <div className="relative z-40 flex items-center gap-3 bg-white/40 border border-white/60 rounded-xl px-4 py-3 backdrop-blur-sm flex-wrap">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Filter size={13} />
            <span className="font-semibold uppercase tracking-wide">Global Filters:</span>
          </div>

          {/* Stack By — controls how KPI cards & bars are grouped */}
          <label className="flex items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-[#1e248c]">Stack by:</span>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupKey)}
              className="border border-[#1e248c]/30 rounded-lg px-3 py-1.5 text-sm bg-[#e7eefe]/60 font-medium text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
            >
              {groupOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <span className="w-px h-5 bg-gray-200" />

          <MultiSelect
            placeholder="All Assignees"
            options={assignees}
            selected={filterAssignees}
            onChange={v => { setFilterAssignees(v); setSelectedIssue(null) }}
          />

          <MultiSelect
            placeholder="All Issue Types"
            options={issueTypes}
            selected={filterTypes}
            onChange={v => { setFilterTypes(v); setSelectedIssue(null) }}
          />

          <MultiSelect
            placeholder="All Disciplines"
            options={disciplines}
            selected={filterDisciplines}
            onChange={v => { setFilterDisciplines(v); setSelectedIssue(null) }}
          />

          <MultiSelect
            placeholder="All Statuses"
            options={allStatuses}
            renderLabel={statusLabel}
            selected={filterStatuses}
            onChange={v => { setFilterStatuses(v); setSelectedIssue(null) }}
          />

          {/* Ad-hoc "filter by any parameter" rows */}
          {extraFilters.map((f, idx) => (
            <span key={f.key} className="flex items-center gap-1.5 bg-[#e7eefe]/50 border border-[#1e248c]/15 rounded-lg pl-2 pr-1 py-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1e248c]">{paramLabel(f.key)}</span>
              <MultiSelect
                size="sm"
                placeholder="Any"
                options={valuesForParam(f.key)}
                selected={f.values}
                onChange={vals => { setExtraFilters(prev => prev.map((x, i) => (i === idx ? { ...x, values: vals } : x))); setSelectedIssue(null) }}
              />
              <button
                onClick={() => { setExtraFilters(prev => prev.filter((_, i) => i !== idx)); setSelectedIssue(null) }}
                title="Remove this filter"
                className="text-gray-400 hover:text-red-500"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {extraParamOptions.length > 0 && (
            <select
              value=""
              onChange={e => { if (e.target.value) setExtraFilters(prev => [...prev, { key: e.target.value, values: [] }]) }}
              className="border border-dashed border-[#1e248c]/40 rounded-lg px-2.5 py-1.5 text-xs bg-white text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
            >
              <option value="">+ Add filter…</option>
              {extraParamOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          {hasGlobalFilters && (
            <button
              onClick={clearGlobalFilters}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
            >
              <X size={12} /> Clear All
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{filtered.length} issues</span>
        </div>

        {/* Loading / auth / error states */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading issues…</span>
          </div>
        )}

        {!loading && needsApsAuth && (
          <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[#e7eefe] flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1e248c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <p className="font-bold text-[#1e248c] text-lg">Connect your Autodesk Account</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                To view ACC issues{project.accHubName ? ` from the ${project.accHubName} hub` : ''}, authenticate with your personal Autodesk account. This is a one-time step.
              </p>
            </div>
            <a
              href={`/api/auth/autodesk?returnTo=${anaView ? '/ana' : '/dashboard'}/${project._id}/reports${project.accHubKey ? `&hub=${project.accHubKey}` : ''}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#1e248c] text-white rounded-xl text-sm font-semibold hover:bg-[#44b8d3] transition-colors shadow-md"
            >
              Sign in with Autodesk
            </a>
          </div>
        )}

        {!loading && !needsApsAuth && error && (
          <div className="glass-card rounded-2xl p-6 flex items-center gap-3 text-red-600">
            <AlertCircle size={18} />
            <div>
              <p className="font-semibold text-sm">Failed to load issues</p>
              <p className="text-xs text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!loading && !needsApsAuth && noAcc && (
          <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-3 text-gray-400">
            <AlertCircle size={32} />
            <p className="font-semibold text-gray-600">No ACC project linked</p>
            <p className="text-sm text-center max-w-sm">
              This project has no Autodesk Construction Cloud URL. Link one via Monday.com (MA-003 board) and run a sync.
            </p>
          </div>
        )}

        {!loading && needsImport && (
          <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-3 text-gray-400">
            <AlertCircle size={32} />
            <p className="font-semibold text-gray-600">No issues uploaded yet</p>
            <p className="text-sm text-center max-w-sm">
              This project is in a client hub outside EasyBIM. Export the issues from ACC and upload the
              file from the project&apos;s <span className="font-medium text-gray-600">Forms &amp; Actions</span> card to build this report.
            </p>
            <Link
              href={`${anaView ? '/ana' : '/dashboard'}/${project._id}`}
              className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e248c] text-white rounded-xl text-sm font-semibold hover:bg-[#44b8d3] transition-colors"
            >
              Go to project to upload
            </Link>
          </div>
        )}

        {!loading && !needsApsAuth && !needsImport && !error && !noAcc && (
          <>
            {/* KPI cards — top 6 groups */}
            {topGroups.length > 0 && (
              <div className={`grid gap-4 ${topGroups.length <= 3 ? 'grid-cols-3' : 'grid-cols-3 md:grid-cols-6'}`}>
                {topGroups.map(([name, iss]) => (
                  <GroupCard key={name} name={name} count={iss.length} total={totalFiltered} />
                ))}
              </div>
            )}

            {totalFiltered === 0 && (
              <div className="glass-card rounded-2xl p-10 text-center text-gray-400">
                No issues match the current filters.
              </div>
            )}

            {totalFiltered > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* Issues by chosen dimension + status legend */}
                <div className="glass-card rounded-2xl p-5 lg:col-span-3 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-[#1e248c] text-sm">Issues by {groupLabel}</h2>
                    <span className="text-xs text-gray-400">{grouped.length} {grouped.length === 1 ? 'group' : 'groups'} · click to filter</span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {grouped.map(([name, iss]) => (
                      <GroupBar
                        key={name}
                        name={name}
                        issues={iss}
                        allStatuses={allStatuses}
                        maxTotal={maxGroupTotal}
                        selected={chartSel}
                        onSelect={(group, status) =>
                          setChartSel(prev =>
                            prev && prev.group === group && prev.status === status ? null : { group, status }
                          )
                        }
                      />
                    ))}
                  </div>

                  {/* Status legend */}
                  <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-100">
                    {allStatuses.map(s => (
                      <span key={s} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ background: statusColor(s) }} />
                        {statusLabel(s)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Issues created per month, stacked by the chosen dimension */}
                <IssuesByMonthChart
                  issues={filtered}
                  groupBy={groupBy}
                  groupLabel={groupLabel}
                  selectedMonth={monthSel}
                  onSelectMonth={selectMonth}
                />
              </div>
            )}

            {/* BIM Issues table */}
            {totalFiltered > 0 && (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="font-semibold text-[#1e248c] text-sm">
                      BIM Issues
                      <span className="ml-2 text-[11px] font-normal text-gray-400">
                        {tableRows.length} of {issues.length}
                      </span>
                    </h2>
                    {chartSel && (
                      <button
                        onClick={() => setChartSel(null)}
                        title="Clear chart filter"
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-[#e7eefe] text-[#1e248c] hover:bg-[#d8ddff] transition-colors"
                      >
                        <span className="text-[10px] opacity-70">chart:</span>
                        {chartSel.group}{chartSel.status ? ` · ${statusLabel(chartSel.status)}` : ''}
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {hasColFilters && (
                      <button
                        onClick={clearColFilters}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                      >
                        <X size={12} /> Clear column filters
                      </button>
                    )}
                    {/* Column picker (gear) */}
                    <div className="relative" ref={gearRef}>
                      <button
                        onClick={() => setGearOpen(o => !o)}
                        title="Choose columns"
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${gearOpen ? 'border-[#1e248c] text-[#1e248c] bg-[#e7eefe]/60' : 'border-gray-200 text-gray-500 hover:text-[#1e248c] hover:border-[#1e248c]/40'}`}
                      >
                        <Settings2 size={14} /> Columns
                      </button>
                      {gearOpen && (
                        <div className="absolute right-0 z-50 mt-1 w-60 max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 mb-1">
                            <span className="text-[11px] font-semibold text-gray-500">Visible columns</span>
                            <button
                              onClick={() => setVisibleKeys(DEFAULT_COLS)}
                              className="text-[10px] text-[#1e248c] hover:underline"
                            >Reset</button>
                          </div>
                          {columns.map(col => (
                            <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50/60 cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                checked={visibleKeys.includes(col.key)}
                                onChange={() =>
                                  setVisibleKeys(v =>
                                    v.includes(col.key) ? v.filter(k => k !== col.key) : [...v, col.key]
                                  )
                                }
                                className="accent-[#1e248c]"
                              />
                              <span className="truncate" title={col.label}>{col.label === '#' ? 'Issue #' : col.label}</span>
                              {col.optional && <span className="ml-auto text-[9px] text-gray-300 uppercase">ACC</span>}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100">
                        {visibleColumns.map(col => (
                          <SortHeader key={col.key} col={col.key} label={col.label} align={col.align} />
                        ))}
                      </tr>
                      {/* Per-column filter row */}
                      <tr className="bg-white border-b border-gray-100 align-top">
                        {visibleColumns.map(col => {
                          const f = col.filter
                          if (!f) return <th key={col.key} />
                          if (f.type === 'text') {
                            return (
                              <th key={col.key} className="px-2 py-2">
                                <input
                                  dir={f.rtl ? 'rtl' : undefined}
                                  value={colText[col.key] ?? ''}
                                  onChange={e => setColText(c => ({ ...c, [col.key]: e.target.value }))}
                                  placeholder={f.placeholder ?? 'Filter…'}
                                  className={`w-full min-w-[120px] border border-gray-200 rounded-md px-2 py-1 text-[11px] font-normal focus:outline-none focus:ring-1 focus:ring-[#1e248c]/30 ${f.rtl ? 'text-right' : ''}`}
                                />
                              </th>
                            )
                          }
                          return (
                            <th key={col.key} className={`px-2 py-2 ${col.align === 'center' ? 'text-center' : ''}`}>
                              <MultiSelect
                                size="sm" placeholder="All"
                                options={f.options}
                                renderLabel={f.renderLabel}
                                selected={colSel[col.key] ?? []}
                                onChange={v => setColSel(c => ({ ...c, [col.key]: v }))}
                              />
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((issue, i) => {
                        const isSelected = selectedIssue?.id === issue.id
                        return (
                          <tr
                            key={issue.id}
                            onClick={() => setSelectedIssue(isSelected ? null : issue)}
                            className={`border-b border-gray-100 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#e7eefe] border-l-4 border-l-[#1e248c]'
                                : i % 2 === 0 ? 'bg-white hover:bg-blue-50/40' : 'bg-blue-50/20 hover:bg-blue-50/50'
                            }`}
                          >
                            {visibleColumns.map(col => (
                              <td
                                key={col.key}
                                dir={col.rtl ? 'rtl' : undefined}
                                title={col.cellTitle?.(issue)}
                                className={`px-4 py-2.5 ${col.cellClass ?? 'text-gray-600'}`}
                              >
                                {col.render(issue)}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                      {tableRows.length === 0 && (
                        <tr>
                          <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-gray-400">
                            No issues match the column filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Issue detail panel — expands below table on selection */}
                {selectedIssue && (
                  <div className="border-t border-[#e7eefe] bg-[#f0f3ff]/60 px-5 py-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] bg-[#e7eefe] text-[#1e248c] px-2 py-0.5 rounded-full font-mono font-semibold">
                        ACTIVE SELECTION
                      </span>
                      <button onClick={() => setSelectedIssue(null)} className="text-xs text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div><p className="text-gray-400">Title</p><p className="font-semibold text-gray-800 mt-0.5">{selectedIssue.title}</p></div>
                      <div><p className="text-gray-400">Assigned To</p><p className="font-medium text-gray-700 mt-0.5">{selectedIssue.assignedTo ?? '—'}</p></div>
                      <div><p className="text-gray-400">Status</p>
                        <span className="inline-block mt-0.5 text-[10px] rounded-full px-2 py-0.5 font-medium"
                          style={{ background: `${statusColor(selectedIssue.status)}20`, color: badgeTextColor(selectedIssue.status), border: `1px solid ${statusColor(selectedIssue.status)}40` }}>
                          {statusLabel(selectedIssue.status)}
                        </span>
                      </div>
                      <div><p className="text-gray-400">Type</p><p className="font-medium text-gray-700 mt-0.5">{selectedIssue.issueType}</p></div>
                      <div><p className="text-gray-400">Discipline</p><p className="font-medium text-gray-700 mt-0.5">{selectedIssue.discipline || '—'}</p></div>
                      <div><p className="text-gray-400">Created</p><p className="font-medium text-gray-700 mt-0.5">{new Date(selectedIssue.createdAt).toLocaleDateString('en-GB')}</p></div>
                      <div><p className="text-gray-400">Created By</p><p className="font-medium text-gray-700 mt-0.5">{selectedIssue.createdBy ?? '—'}</p></div>
                    </div>
                    {selectedIssue.description && (
                      <p className="text-xs text-gray-600 bg-white/70 rounded-lg p-3 leading-relaxed">{selectedIssue.description}</p>
                    )}
                    <div className="flex gap-2">
                      <button disabled className="px-4 py-1.5 border border-[#1e248c] text-[#1e248c] rounded-lg text-xs font-medium opacity-40 cursor-not-allowed">Update Status</button>
                      <button disabled className="px-4 py-1.5 bg-[#1e248c] text-white rounded-lg text-xs font-medium opacity-40 cursor-not-allowed">Assign</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ExportReportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        project={project}
        issues={normalizedIssues}
        allStatuses={allStatuses}
        issueTypes={issueTypes}
        disciplines={disciplines}
        assignees={assignees}
        defaultGroupBy={groupBy}
        defaultAssignees={filterAssignees}
        defaultTypes={filterTypes}
        defaultDisciplines={filterDisciplines}
        defaultStatuses={filterStatuses}
        defaultExtraFilters={extraFilters}
        defaultMonth={monthSel}
      />
    </div>
  )
}
