'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Cloud, Loader2, Search } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import type { AccIssue } from '@/lib/services/apsService'
import { normalizeStatus } from '@/lib/reportGrouping'
import TeamMemberCell from '@/components/TeamMemberCell'

// Issue tallies for a project. `null` while loading; `undefined` when
// unavailable (no ACC link / not authenticated / no issues).
type IssueStat = { open: number; closed: number; total: number; pct: number } | null | undefined

function sortByProjectName(a: ProjectRow, b: ProjectRow): number {
  return a.projectName.localeCompare(b.projectName, 'he')
}

// ── Inline-editable text cell (saves on blur / Enter, reverts on Escape) ──
function EditableCell({
  value, placeholder, saving, onSave, align = 'right',
}: {
  value: string
  placeholder: string
  saving: boolean
  onSave: (next: string) => void
  align?: 'right' | 'left' | 'center'
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="relative">
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        disabled={saving}
        dir="auto"
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const next = draft.trim(); if (next !== value) onSave(next) }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() }
        }}
        className={`w-full px-2 py-1 rounded-md border border-transparent hover:border-gray-200 focus:border-[#44b8d3] bg-transparent focus:bg-white text-sm outline-none transition-colors disabled:opacity-50 text-${align}`}
      />
      {saving && <Loader2 size={12} className="animate-spin absolute right-1 top-1/2 -translate-y-1/2 text-gray-300" />}
    </div>
  )
}

// Issue status cell: closed / total and the completion % (closed ÷ total),
// e.g. "20/100 · 20%", with a slim progress bar.
function IssueStatusCell({ stat }: { stat: IssueStat }) {
  if (stat === null) return <Loader2 size={13} className="animate-spin text-gray-300 mx-auto" />
  if (stat === undefined) return <span className="text-gray-300 text-xs">—</span>
  const { closed, total, pct } = stat
  const color = pct >= 80 ? '#00c875' : pct >= 40 ? '#fdab3d' : '#ba1a1a'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold tabular-nums">
        <span className="text-gray-700">{closed}/{total}</span>
        <span className="text-gray-300">·</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function AnaProjectsClient({ projects }: { projects: ProjectRow[] }) {
  const [searchQuery, setSearchQuery] = useState('')
  // Client-editable fields (status / type), seeded from the server. The Number is
  // ACC-derived and read-only, so it isn't part of this local edit state.
  const [edits, setEdits] = useState<Record<string, ProjectRow['ana']>>(
    () => Object.fromEntries(projects.map(p => [p._id, p.ana ?? {}]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [issueStat, setIssueStat] = useState<Record<string, IssueStat>>(
    () => Object.fromEntries(projects.map(p => [p._id, null]))
  )

  // Fetch each project's issues once to derive open / closed / completion %.
  useEffect(() => {
    let alive = true
    for (const p of projects) {
      fetch(`/api/projects/${p._id}/issues`)
        .then(r => r.json())
        .then((data: { issues?: AccIssue[]; count?: number }) => {
          if (!alive) return
          const issues = data.issues ?? []
          if (issues.length === 0) {
            setIssueStat(prev => ({ ...prev, [p._id]: undefined }))
            return
          }
          const closed = issues.filter(i => normalizeStatus(i.status) === 'closed').length
          const total = issues.length
          setIssueStat(prev => ({
            ...prev,
            [p._id]: { open: total - closed, closed, total, pct: Math.round((closed / total) * 100) },
          }))
        })
        .catch(() => { if (alive) setIssueStat(prev => ({ ...prev, [p._id]: undefined })) })
    }
    return () => { alive = false }
  }, [projects])

  async function saveField(projectId: string, field: 'status' | 'projectType', value: string) {
    setSaving(`${projectId}:${field}`)
    setEdits(prev => ({ ...prev, [projectId]: { ...prev[projectId], [field]: value } }))
    try {
      await fetch(`/api/ana/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
    } finally {
      setSaving(null)
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = projects.filter(p => {
      if (!q) return true
      return (
        p.projectName.toLowerCase().includes(q) ||
        (p.ana?.number ?? '').toLowerCase().includes(q)
      )
    })
    return [...list].sort(sortByProjectName)
  }, [projects, searchQuery])

  if (projects.length === 0) {
    return <div className="text-center py-16 text-gray-400">No ANA projects yet.</div>
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Toolbar — search, matching the EPM projects page. */}
      <div className="flex items-center justify-end">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 text-sm bg-white/80 border border-white/90 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Result count */}
      <p className="text-xs text-gray-500 -mt-2">
        Showing {filtered.length} of {projects.length} projects
      </p>

      {/* Table — same arrangement as the EPM projects table: metrics/links on the
          left, Project Name anchored at the far-right (RTL reading edge). */}
      <div className="overflow-x-auto">
        <div className="w-full rounded-2xl border border-white/80 shadow-sm">
          <table className="table-fixed border-collapse text-sm w-full min-w-[760px]">
            <colgroup>
              <col className="w-[20%]" />{/* Issue Status */}
              <col className="w-[8%]" />{/* BIM Mgmt */}
              <col className="w-[8%]" />{/* MEP Coord */}
              <col className="w-[6%]" />{/* ACC */}
              <col className="w-[13%]" />{/* Type */}
              <col className="w-[13%]" />{/* Status */}
              <col className="w-[7%]" />{/* Number */}
              <col className="w-[25%]" />{/* Project Name — far right, largest share */}
            </colgroup>
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Issue Status</th>
                <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">BIM<br/>Mgmt</th>
                <th className="px-2 py-2 text-center font-medium text-[#44b8d3] whitespace-nowrap text-xs">MEP<br/>Coord</th>
                <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">ACC</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Type</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Status</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Number</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Project Name</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const ana = edits[p._id] ?? {}
                const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'
                return (
                  <tr key={p._id} className={`border-b border-gray-100 hover:bg-blue-50/60 transition-colors ${rowBg}`}>
                    {/* Issue status — closed/total · % */}
                    <td className="px-2 py-1.5 text-center"><IssueStatusCell stat={issueStat[p._id]} /></td>

                    {/* BIM Management */}
                    <td className="px-2 py-1.5"><TeamMemberCell member={p.bimManager} /></td>

                    {/* MEP Coordination */}
                    <td className="px-2 py-1.5"><TeamMemberCell member={p.mepCoordinator} /></td>

                    {/* ACC link */}
                    <td className="px-2 py-1.5 text-center">
                      {p.links.acc ? (
                        <a
                          href={p.links.acc}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Open in Autodesk ACC"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-colors"
                        >
                          <Cloud size={13} />
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Editable: Project Type */}
                    <td className="px-1 py-1">
                      <EditableCell
                        value={ana.projectType ?? ''}
                        placeholder="—"
                        saving={saving === `${p._id}:projectType`}
                        onSave={v => saveField(p._id, 'projectType', v)}
                      />
                    </td>

                    {/* Editable: Status */}
                    <td className="px-1 py-1">
                      <EditableCell
                        value={ana.status ?? ''}
                        placeholder="—"
                        saving={saving === `${p._id}:status`}
                        onSave={v => saveField(p._id, 'status', v)}
                      />
                    </td>

                    {/* Number — ACC jobNumber, read-only */}
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-[#1e248c]">
                      {p.ana?.number || <span className="text-gray-300">—</span>}
                    </td>

                    {/* Project name — RTL, links to the ANA detail page */}
                    <td className="px-2 py-1.5 font-medium" dir="rtl">
                      <Link
                        href={`/ana/${p._id}`}
                        title={p.projectName}
                        className="block truncate text-[#1e248c] hover:underline"
                      >
                        {p.projectName}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
