'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, CheckCircle2, AlertTriangle, Loader2, UploadCloud, FileSpreadsheet, HelpCircle } from 'lucide-react'
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

// Deep-link to the ACC project's Issues module (where the XLSX export lives),
// rather than the stored Files/Docs URL. Region-aware: reuses the host of the
// stored project URL (acc.autodesk.com vs acc.autodesk.eu) when available.
function accIssuesUrl(accProjectId?: string, accUrl?: string): string | null {
  if (!accProjectId) return accUrl ?? null
  let host = 'acc.autodesk.com'
  try {
    if (accUrl) host = new URL(accUrl).host
  } catch {
    // malformed stored URL — fall back to the global host
  }
  return `https://${host}/build/issues/projects/${accProjectId}`
}

interface ImportMeta {
  imported: boolean
  count?: number
  fileName?: string
  uploadedByName?: string | null
  uploadedAt?: string | null
}

export default function FormaConnectPanel({
  projectId,
  projectNumber,
  accProjectId,
  accUrl,
  accExternalHub,
  partnerHubName,
  partnerHubKey,
  basePath = '/dashboard',
}: {
  projectId: string
  projectNumber: string
  accProjectId?: string
  accUrl?: string
  accExternalHub?: boolean
  // Set when the external hub is a configured partner account (e.g. 'ANA') —
  // issues come from the live API, so the Excel-import UI is not shown.
  partnerHubName?: string
  // Registry key (e.g. 'ana') — routes the project list + OAuth through the
  // partner app's credentials.
  partnerHubKey?: string
  // Route prefix for the project's pages — '/dashboard' internally, '/ana' in
  // the ANA client area — so "Get Forma Status" and OAuth returns land correctly.
  basePath?: string
}) {
  const router = useRouter()
  const importMode = !!accExternalHub && !partnerHubName

  // ── External-hub (Excel import) state ──
  const [importMeta, setImportMeta] = useState<ImportMeta | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── EasyBIM-hub (dropdown) state ──
  const [projects, setProjects] = useState<AccProjectSummary[]>([])
  const [loading, setLoading] = useState(!importMode)
  const [stateMsg, setStateMsg] = useState<'needsAuth' | 'error' | null>(null)
  const [savedId, setSavedId] = useState<string>(accProjectId ?? '')
  const [selected, setSelected] = useState<string>(accProjectId ?? '')
  const [saving, setSaving] = useState(false)

  // External hub: load the current import metadata (no Autodesk fetch).
  useEffect(() => {
    if (!importMode) return
    let cancelled = false
    fetch(`/api/projects/${projectId}/issues-import`)
      .then(r => r.json())
      .then((d: ImportMeta) => { if (!cancelled) setImportMeta(d) })
      .catch(() => { if (!cancelled) setImportMeta({ imported: false }) })
    return () => { cancelled = true }
  }, [importMode, projectId])

  // EasyBIM / partner hub: load the ACC project list for the dropdown.
  useEffect(() => {
    if (importMode) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/acc/projects${partnerHubKey ? `?hub=${partnerHubKey}` : ''}`)
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
  }, [importMode, partnerHubKey])

  const autoMatch = useMemo(
    () => (projects.length ? matchByNumber(projects, projectNumber) : null),
    [projects, projectNumber]
  )

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

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadErr(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/projects/${projectId}/issues-import`, { method: 'POST', body })
      const data = await res.json() as { ok?: boolean; count?: number; fileName?: string; uploadedAt?: string; error?: string }
      if (!res.ok || data.error) {
        setUploadErr(data.error ?? 'Upload failed')
        return
      }
      setImportMeta({ imported: true, count: data.count, fileName: data.fileName, uploadedAt: data.uploadedAt })
      router.refresh()
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

  // ── External-hub render: Excel upload instead of the project dropdown ──
  if (importMode) {
    const imported = importMeta?.imported
    return (
      <div className="glass-card rounded-2xl p-4 border border-[#1e248c]/10 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
            <ExternalLink size={15} className="text-[#44b8d3]" /> Forms &amp; Actions
            <span
              title="This ACC project is outside the EasyBIM Hub (connected via MA-003)"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> External hub
            </span>
          </h2>
          {accUrl && (
            <a href={accUrl} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-gray-400 flex items-center gap-1 hover:text-[#1e248c] shrink-0">
              <ExternalLink size={11} /> ACC
            </a>
          )}
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed">
          This project is in a client hub outside EasyBIM, so issues can&apos;t be pulled automatically.
          Export the issues from ACC and upload the file to build the report.
        </p>

        {/* Current import status */}
        {imported ? (
          <div className="flex items-start gap-2 text-xs bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="text-green-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium text-green-700">{importMeta!.count} issues imported</p>
              <p className="text-[11px] text-gray-500 truncate">
                {importMeta!.fileName}
                {importMeta!.uploadedAt ? ` · ${fmtDate(importMeta!.uploadedAt)}` : ''}
                {importMeta!.uploadedByName ? ` · ${importMeta!.uploadedByName}` : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No issues uploaded yet.</p>
        )}

        {uploadErr && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>{uploadErr}</span>
          </div>
        )}

        <div className="flex flex-col gap-2.5 mt-auto">
          {/* How-to (hover preview) + a direct link to the ACC project to export from */}
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
            <div className="relative group/howto">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-[#44b8d3] hover:text-[#1e248c] transition-colors"
              >
                <HelpCircle size={13} /> How to export the issues from ACC
              </button>
              <div className="absolute z-50 bottom-full left-0 mb-2 hidden group-hover/howto:block">
                <a
                  href="/How%20to%20download%20excel%20report%20from%20Forma.png"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/How%20to%20download%20excel%20report%20from%20Forma.png"
                    alt="How to download the Excel issues report from ACC / Forma"
                    className="w-[480px] max-w-[80vw] rounded-lg shadow-2xl border border-gray-200 bg-white"
                  />
                </a>
              </div>
            </div>

            {accIssuesUrl(accProjectId, accUrl) && (
              <a
                href={accIssuesUrl(accProjectId, accUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1e248c] hover:text-[#44b8d3] transition-colors"
              >
                <ExternalLink size={13} /> Open ACC Issues to export
              </a>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full inline-flex items-center justify-center gap-2 border border-[#1e248c] text-[#1e248c] rounded-lg py-2 text-sm font-semibold hover:bg-[#1e248c]/5 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : (imported ? <FileSpreadsheet size={14} /> : <UploadCloud size={14} />)}
            {uploading ? 'Uploading…' : imported ? 'Replace issues file' : 'Upload issues (Excel / CSV)'}
          </button>

          <button
            onClick={() => router.push(`${basePath}/${projectId}/reports`)}
            disabled={!imported}
            className="w-full bg-[#1e248c] text-white rounded-lg py-2 text-sm font-semibold hover:bg-[#44b8d3] transition-colors disabled:opacity-40 disabled:hover:bg-[#1e248c]"
          >
            Get Forma Status
          </button>
        </div>
      </div>
    )
  }

  // ── EasyBIM-hub / partner-hub render: ACC project dropdown, live issues ──
  return (
    <div className="glass-card rounded-2xl p-4 border border-[#1e248c]/10 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
          <ExternalLink size={15} className="text-[#44b8d3]" /> Forms &amp; Actions
          {partnerHubName && (
            <span
              title={`This ACC project lives in the ${partnerHubName} hub — connected via their API integration`}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-[#1e248c] bg-[#e7eefe] border border-[#44b8d3]/40 rounded-full px-2 py-0.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#44b8d3]" /> {partnerHubName} hub
            </span>
          )}
        </h2>
        {accUrl && (
          <a
            href={accUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-400 flex items-center gap-1 hover:text-[#1e248c] shrink-0"
          >
            <ExternalLink size={11} /> ACC
          </a>
        )}
      </div>

      {/* Connection status */}
      <div className="text-xs">
        {connected ? (
          <p className="flex items-center gap-1.5 text-green-600 font-medium">
            <CheckCircle2 size={13} className="shrink-0" /> <span className="truncate">{connected.name}</span>
            {connected.jobNumber && <span className="text-gray-400 font-mono shrink-0">#{connected.jobNumber}</span>}
          </p>
        ) : (
          <p className="text-gray-400">Not connected to a Forma / ACC project</p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 mt-auto">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Select Forma Project</label>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 size={14} className="animate-spin" /> Loading projects…
            </div>
          ) : stateMsg === 'needsAuth' ? (
            <a
              href={`/api/auth/autodesk?returnTo=${basePath}/${projectId}${partnerHubKey ? `&hub=${partnerHubKey}` : ''}`}
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
          onClick={() => router.push(`${basePath}/${projectId}/reports`)}
          disabled={!savedId}
          className="w-full bg-[#1e248c] text-white rounded-lg py-2 text-sm font-semibold hover:bg-[#44b8d3] transition-colors disabled:opacity-40 disabled:hover:bg-[#1e248c]"
        >
          Get Forma Status
        </button>
      </div>
    </div>
  )
}
