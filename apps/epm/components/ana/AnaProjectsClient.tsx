'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cloud, Loader2 } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import type { AccIssue } from '@/lib/services/apsService'
import { normalizeStatus } from '@/lib/reportGrouping'
import TeamMemberCell from '@/components/TeamMemberCell'

// Issue-completion % for a project: closed ÷ total. `null` while loading;
// `undefined` when unavailable (no ACC link / not authenticated / no issues).
type IssuePct = number | null | undefined

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

function IssueStatusCell({ pct }: { pct: IssuePct }) {
  if (pct === null) return <Loader2 size={13} className="animate-spin text-gray-300 mx-auto" />
  if (pct === undefined) return <span className="text-gray-300 text-xs">—</span>
  const color = pct >= 80 ? '#00c875' : pct >= 40 ? '#fdab3d' : '#ba1a1a'
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color: '#1e248c' }}>{pct}%</span>
    </div>
  )
}

export default function AnaProjectsClient({ projects }: { projects: ProjectRow[] }) {
  // Client-editable fields, seeded from the server and mutated locally on save.
  const [edits, setEdits] = useState<Record<string, ProjectRow['ana']>>(
    () => Object.fromEntries(projects.map(p => [p._id, p.ana ?? {}]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [issuePct, setIssuePct] = useState<Record<string, IssuePct>>(
    () => Object.fromEntries(projects.map(p => [p._id, null]))
  )

  // Fetch each project's issues once to derive the completion % (closed ÷ total).
  useEffect(() => {
    let alive = true
    for (const p of projects) {
      fetch(`/api/projects/${p._id}/issues`)
        .then(r => r.json())
        .then((data: { issues?: AccIssue[]; count?: number }) => {
          if (!alive) return
          const issues = data.issues ?? []
          if (issues.length === 0) {
            setIssuePct(prev => ({ ...prev, [p._id]: undefined }))
            return
          }
          const closed = issues.filter(i => normalizeStatus(i.status) === 'closed').length
          setIssuePct(prev => ({ ...prev, [p._id]: Math.round((closed / issues.length) * 100) }))
        })
        .catch(() => { if (alive) setIssuePct(prev => ({ ...prev, [p._id]: undefined })) })
    }
    return () => { alive = false }
  }, [projects])

  async function saveField(projectId: string, field: 'number' | 'status' | 'projectType', value: string) {
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

  if (projects.length === 0) {
    return <div className="text-center py-16 text-gray-400">No ANA projects yet.</div>
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full rounded-2xl border border-white/80 shadow-sm bg-white/60 backdrop-blur-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200 text-xs text-gray-600">
              <th className="px-3 py-2.5 text-right font-medium">Project</th>
              <th className="px-3 py-2.5 text-right font-medium">Number</th>
              <th className="px-3 py-2.5 text-right font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Type</th>
              <th className="px-3 py-2.5 text-center font-medium">ACC</th>
              <th className="px-3 py-2.5 text-center font-medium">BIM Mgmt</th>
              <th className="px-3 py-2.5 text-center font-medium">MEP Coord</th>
              <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">Issue Status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => {
              const ana = edits[p._id] ?? {}
              return (
                <tr key={p._id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white/40' : 'bg-blue-50/20'} hover:bg-blue-50/50 transition-colors`}>
                  {/* Project name — RTL, links to the ANA detail page */}
                  <td className="px-3 py-2 font-medium min-w-[180px]" dir="rtl">
                    <Link
                      href={`/ana/${p._id}`}
                      title={p.projectName}
                      className="block truncate max-w-[220px] text-[#1e248c] hover:underline"
                    >
                      {p.projectName}
                    </Link>
                  </td>

                  {/* Editable: Number */}
                  <td className="px-2 py-1 min-w-[110px]">
                    <EditableCell
                      value={ana.number ?? ''}
                      placeholder="—"
                      saving={saving === `${p._id}:number`}
                      onSave={v => saveField(p._id, 'number', v)}
                    />
                  </td>

                  {/* Editable: Status */}
                  <td className="px-2 py-1 min-w-[120px]">
                    <EditableCell
                      value={ana.status ?? ''}
                      placeholder="—"
                      saving={saving === `${p._id}:status`}
                      onSave={v => saveField(p._id, 'status', v)}
                    />
                  </td>

                  {/* Editable: Project Type */}
                  <td className="px-2 py-1 min-w-[120px]">
                    <EditableCell
                      value={ana.projectType ?? ''}
                      placeholder="—"
                      saving={saving === `${p._id}:projectType`}
                      onSave={v => saveField(p._id, 'projectType', v)}
                    />
                  </td>

                  {/* ACC link */}
                  <td className="px-3 py-2 text-center">
                    {p.links.acc ? (
                      <a
                        href={p.links.acc}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Autodesk ACC"
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-colors"
                      >
                        <Cloud size={13} />
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* BIM Management */}
                  <td className="px-3 py-2 text-center"><TeamMemberCell member={p.bimManager} /></td>

                  {/* MEP Coordination */}
                  <td className="px-3 py-2 text-center"><TeamMemberCell member={p.mepCoordinator} /></td>

                  {/* Issue completion % (closed ÷ total) */}
                  <td className="px-3 py-2 text-center"><IssueStatusCell pct={issuePct[p._id]} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
