'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, LayoutGrid, FolderOpen, Search } from 'lucide-react'

const PURPLE = '#7b5cff'
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

export default function ProjectStatus({ agentKey, onBack }: { agentKey: string; onBack: () => void }) {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/projects`, { cache: 'no-store' })
      if (res.ok) { const d = await res.json(); setRows(d.projects ?? []) }
    } catch { /* transient */ } finally { setLoading(false) }
  }, [agentKey])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => r.projectNumber.toLowerCase().includes(s) || r.projectName.toLowerCase().includes(s))
  }, [rows, q])

  const publishedCount = rows.filter((r) => r.publishedToLinkedIn).length
  const portfolioCount = rows.filter((r) => r.inPortfolio).length

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
    <div style={{ minHeight: '100vh', fontFamily: "'Manrope','Assistant',system-ui,sans-serif", color: '#1f2430', background: 'linear-gradient(180deg,#faf9ff 0%,#f5f3fd 100%)' }}>
      {/* Full-width like the EPM projects page — the table earns the room. */}
      <div style={{ padding: '20px 24px 48px' }}>
        {/* header */}
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 30 }}>🦚</span>
            <div>
              <div className="flex items-center gap-2.5">
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Project Status</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: PURPLE, background: '#f0ecff', padding: '4px 10px', borderRadius: 999 }}>{rows.length} projects</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#9aa0ac', fontWeight: 500, marginTop: 2 }}>
                Mark which projects are published to LinkedIn and which belong in the portfolio.
              </div>
            </div>
          </div>
          <button onClick={onBack} className="flex items-center gap-2 font-bold" style={{ fontSize: 14, padding: '10px 16px', borderRadius: 12, border: '1px solid #e7e3f7', background: '#fff', color: PURPLE }}>
            <ArrowLeft size={15} /> Dashboard
          </button>
        </header>

        {/* summary + search */}
        <div className="flex items-center gap-3 mb-4">
          <Summary label="Published to LinkedIn" value={publishedCount} total={rows.length} color={LINKEDIN} />
          <Summary label="In portfolio" value={portfolioCount} total={rows.length} color={PURPLE} />
          <div className="flex items-center gap-2 ml-auto rounded-xl border border-white/80 bg-white px-3 py-2 shadow-sm">
            <Search size={15} style={{ color: '#9aa0ac' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project…"
              style={{ border: 'none', outline: 'none', fontSize: 13.5, background: 'transparent', width: 190, fontFamily: 'inherit' }} />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {q ? 'No projects match this filter.' : 'No projects found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="w-full rounded-2xl border border-white/80 bg-white shadow-sm">
              {/* Percentage widths + w-full stretch the table edge-to-edge and spread
                  columns proportionally as the viewport grows; min-w keeps them usable
                  (and lets the wrapper scroll) on narrow screens. Project Name gets the
                  largest share so long Hebrew names have room. Percentages sum to 100. */}
              <table className="table-fixed border-collapse text-sm w-full min-w-[900px]">
                <colgroup>
                  <col className="w-[9%]" />{/* LinkedIn */}
                  <col className="w-[9%]" />{/* Portfolio */}
                  <col className="w-[7%]" />{/* Monday */}
                  <col className="w-[7%]" />{/* Drive */}
                  <col className="w-[12%]" />{/* Status */}
                  <col className="w-[8%]" />{/* Proj # */}
                  {/* Project Name — far right so Hebrew names anchor the RTL reading edge. */}
                  <col className="w-[48%]" />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">LinkedIn</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Portfolio</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Monday</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Drive</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Status</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Proj #</th>
                    <th className="px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap">Project Name</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
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
                          <Toggle on={r.inPortfolio} color={PURPLE}
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
          </div>
        )}
      </div>
    </div>
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
