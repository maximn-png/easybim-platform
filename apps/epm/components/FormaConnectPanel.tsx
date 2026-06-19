'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import type { AccProjectSummary } from '@/lib/services/apsService'

// Client-side mirror of matchAccProjectByNumber (kept inline to avoid importing
// the server-only apsService module into the client bundle).
function matchByNumber(projects: AccProjectSummary[], projectNumber: string): AccProjectSummary | null {
  const target = projectNumber.trim().toUpperCase()
  if (!target) return null
  const byJob = projects.find(p => (p.jobNumber ?? '').trim().toUpperCase() === target)
  if (byJob) return byJob
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tokenRe = new RegExp(`(^|[^0-9A-Za-z])${escaped}([^0-9A-Za-z]|$)`)
  return projects.find(p => tokenRe.test(p.name.toUpperCase())) ?? null
}

export default function FormaConnectPanel({
  projectId,
  projectNumber,
  accProjectId,
  accUrl,
}: {
  projectId: string
  projectNumber: string
  accProjectId?: string
  accUrl?: string
}) {
  const router = useRouter()

  const [projects, setProjects] = useState<AccProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [stateMsg, setStateMsg] = useState<'needsAuth' | 'error' | null>(null)
  const [savedId, setSavedId] = useState<string>(accProjectId ?? '')
  const [selected, setSelected] = useState<string>(accProjectId ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/acc/projects')
        const data = await res.json() as {
          projects?: AccProjectSummary[]
          needsApsAuth?: boolean
          error?: string
        }
        if (cancelled) return
        if (data.needsApsAuth) { setStateMsg('needsAuth'); return }
        if (data.error) { setStateMsg('error'); return }
        setProjects(data.projects ?? [])
      } catch {
        if (!cancelled) setStateMsg('error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const autoMatch = useMemo(
    () => (projects.length ? matchByNumber(projects, projectNumber) : null),
    [projects, projectNumber]
  )

  // Default the dropdown to the saved link, else the auto-detected match.
  useEffect(() => {
    if (!selected && (savedId || autoMatch)) setSelected(savedId || autoMatch!.id)
  }, [savedId, autoMatch, selected])

  const connected = projects.find(p => p.id === savedId) ?? null
  const dirty = selected !== '' && selected !== savedId

  async function handleConnect() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/acc-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accProjectId: selected }),
      })
      if (res.ok) {
        setSavedId(selected)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5 border border-[#1e248c]/10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-[#1e248c] text-sm">Forms &amp; Actions</h2>
        {accUrl && (
          <a
            href={accUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-400 flex items-center gap-1 hover:text-[#1e248c]"
          >
            <ExternalLink size={11} /> Autodesk Construction Cloud
          </a>
        )}
      </div>

      {/* Connection status */}
      <div className="mb-4 text-xs">
        {connected ? (
          <p className="flex items-center gap-1.5 text-green-600 font-medium">
            <CheckCircle2 size={13} /> Connected to {connected.name}
            {connected.jobNumber && <span className="text-gray-400 font-mono">#{connected.jobNumber}</span>}
          </p>
        ) : (
          <p className="text-gray-400">Not connected to a Forma / ACC project</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Select Forma Project</label>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 size={14} className="animate-spin" /> Loading projects…
            </div>
          ) : stateMsg === 'needsAuth' ? (
            <a
              href={`/api/auth/autodesk?returnTo=/dashboard/${projectId}`}
              className="w-full inline-flex items-center justify-center gap-2 border border-[#1e248c] text-[#1e248c] rounded-lg py-2 text-sm font-semibold hover:bg-[#1e248c]/5 transition-colors"
            >
              Sign in with Autodesk to load projects
            </a>
          ) : stateMsg === 'error' ? (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>Could not load ACC projects. Check the server logs.</span>
            </div>
          ) : (
            <>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
              >
                <option value="" disabled>Search or select project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.hubName ? `${p.hubName} / ` : ''}{p.name}{p.jobNumber ? ` — ${p.jobNumber}` : ''}
                    {autoMatch?.id === p.id ? '  (auto-matched)' : ''}
                  </option>
                ))}
              </select>
              {autoMatch && !savedId && (
                <p className="text-[11px] text-[#44b8d3] mt-1">
                  Auto-matched by #{projectNumber} — click Connect to link it.
                </p>
              )}
              {dirty && (
                <button
                  onClick={handleConnect}
                  disabled={saving}
                  className="mt-2 w-full border border-[#1e248c] text-[#1e248c] rounded-lg py-2 text-sm font-semibold hover:bg-[#1e248c]/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {savedId ? 'Update connection' : 'Connect'}
                </button>
              )}
            </>
          )}
        </div>

        <button
          onClick={() => router.push(`/dashboard/${projectId}/reports`)}
          disabled={!savedId}
          className="w-full bg-[#1e248c] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#44b8d3] transition-colors disabled:opacity-40 disabled:hover:bg-[#1e248c]"
        >
          Get Forma Status
        </button>
      </div>
    </div>
  )
}
