'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Search, FolderOpen } from 'lucide-react'

const PURPLE = '#7b5cff'
const CARD = { background: '#fff', border: '1px solid #eeecf6', borderRadius: 22, boxShadow: '0 6px 20px rgba(90,70,180,.05)' }

interface ProjectRow {
  projectNumber: string
  projectName: string
  status: string | null
  mondayUrl: string | null
  driveUrl: string | null
  publishedToLinkedIn: boolean
  inPortfolio: boolean
}

const STATUS_COLOR: Record<string, string> = {
  'Working on it': '#3b82f6',
  Done: '#22c55e',
  'On Hold': '#f59e0b',
  Stuck: '#ef4444',
  'Not Started': '#9ca3af',
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
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 28px 60px' }}>
        {/* header */}
        <header className="flex items-center justify-between mb-6">
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
          <Summary label="Published to LinkedIn" value={publishedCount} total={rows.length} color="#0a66c2" />
          <Summary label="In portfolio" value={portfolioCount} total={rows.length} color={PURPLE} />
          <div className="flex items-center gap-2 ml-auto" style={{ ...CARD, borderRadius: 12, padding: '8px 12px' }}>
            <Search size={15} style={{ color: '#9aa0ac' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project…" style={{ border: 'none', outline: 'none', fontSize: 13.5, background: 'transparent', width: 180, fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* table */}
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div className="grid items-center" style={{ gridTemplateColumns: '1.9fr 1fr 0.8fr 1fr 1fr', padding: '13px 22px', borderBottom: '1px solid #f2f1f8', fontSize: 12, fontWeight: 700, color: '#9aa0ac', letterSpacing: '.02em' }}>
            <span>Project</span><span>Status</span><span>Links</span>
            <span className="text-center">LinkedIn</span><span className="text-center">Portfolio</span>
          </div>

          {loading && <div style={{ padding: '28px', textAlign: 'center', color: '#a9adb8', fontSize: 14 }}>Loading…</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: '28px', textAlign: 'center', color: '#a9adb8', fontSize: 14 }}>No projects{q ? ' match your search' : ' found'}.</div>}

          {filtered.map((r, i) => (
            <div key={r.projectNumber || i} className="grid items-center" style={{ gridTemplateColumns: '1.9fr 1fr 0.8fr 1fr 1fr', padding: '14px 22px', borderTop: i === 0 ? 'none' : '1px solid #f6f5fb', background: i % 2 ? '#fbfaff' : '#fff' }}>
              <div className="min-w-0">
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2b2f3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.projectName || '(unnamed)'}</div>
                <div style={{ fontSize: 12, color: '#a9adb8', marginTop: 2 }}>#{r.projectNumber}</div>
              </div>
              <div><StatusBadge status={r.status} /></div>
              <div className="flex items-center gap-2">
                {r.mondayUrl && <IconLink href={r.mondayUrl} title="Monday board"><ExternalLink size={15} /></IconLink>}
                {r.driveUrl && <IconLink href={r.driveUrl} title="Drive folder"><FolderOpen size={15} /></IconLink>}
                {!r.mondayUrl && !r.driveUrl && <span style={{ color: '#cbd0da', fontSize: 12 }}>—</span>}
              </div>
              <div className="flex justify-center"><Toggle on={r.publishedToLinkedIn} color="#0a66c2" onChange={(v) => toggle(r.projectNumber, 'publishedToLinkedIn', v)} /></div>
              <div className="flex justify-center"><Toggle on={r.inPortfolio} color={PURPLE} onChange={(v) => toggle(r.projectNumber, 'inPortfolio', v)} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Summary({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div style={{ ...CARD, borderRadius: 14, padding: '10px 16px' }} className="flex items-center gap-3">
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 13, color: '#5a5f6e', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{value}<span style={{ color: '#b0aebc', fontWeight: 600, fontSize: 12 }}>/{total}</span></span>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const color = (status && STATUS_COLOR[status]) || '#9ca3af'
  return <span style={{ fontSize: 11.5, fontWeight: 700, color, background: `${color}1f`, padding: '4px 10px', borderRadius: 999 }}>{status ?? 'Unknown'}</span>
}

function IconLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: '#f0ecff', color: PURPLE }}>
      {children}
    </a>
  )
}

function Toggle({ on, color, onChange }: { on: boolean; color: string; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{ border: 'none', cursor: 'pointer', padding: 0, width: 40, height: 23, borderRadius: 999, background: on ? color : '#dcdae8', position: 'relative', transition: 'background .18s' }}>
      <span style={{ position: 'absolute', top: 2.5, left: on ? 20 : 2.5, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .18s' }} />
    </button>
  )
}
