'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { Box, Loader2, AlertCircle, RefreshCw, Eye } from 'lucide-react'

// Autodesk Viewer SDK (v7) — same on-demand CDN loader as the ANA combined
// viewer; the two components can share the injected <script> safely because
// both check window.Autodesk first.
const VIEWER_VERSION = '7.*'
const VIEWER_CSS = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}/style.min.css`
const VIEWER_JS = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}/viewer3D.min.js`

let sdkPromise: Promise<void> | null = null
function loadViewerSdk(): Promise<void> {
  if ((window as any).Autodesk?.Viewing) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector('link[data-aps-viewer]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.href = VIEWER_CSS; link.dataset.apsViewer = '1'
      document.head.appendChild(link)
    }
    const existing = document.querySelector('script[data-aps-viewer]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Viewer SDK failed to load')))
      return
    }
    const s = document.createElement('script')
    s.src = VIEWER_JS; s.dataset.apsViewer = '1'
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Viewer SDK failed to load'))
    document.head.appendChild(s)
  })
  return sdkPromise
}

interface CoordModel {
  name: string
  urn: string
  path: string
  area: 'WIP' | 'Shared' | null
  versionNumber: number
  publishedAt: string | null
  publishedBy: string | null
  accModifiedAt: string | null
  accUrl: string | null
  processingVersion?: number   // newer version still translating in ACC
}
interface View3D { guid: string; name: string; node: any }

const nameOfNode = (n: any) => String((typeof n?.name === 'function' ? n.name() : n?.data?.name) ?? '')

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// Coordination model viewer for the internal project page's CENTER column.
// One 3D canvas that fills the card's height; the model and its published 3D
// views (EB_3D_1.Archituctural … EB_3D_8.Coordination on 22130) are switched
// via compact selects in the header, so the card works at column widths.
// Renders nothing when the project's hub is unsupported (only EasyBIM + ANA
// hubs have viewer credentials) — onUnsupported lets the page reflow.
export default function CoordinationModelViewer({
  projectId, className = '', onUnsupported,
}: {
  projectId: string
  className?: string
  onUnsupported?: () => void
}) {
  const canvas = useRef<HTMLDivElement>(null)
  const viewer = useRef<any>(null)
  const docByUrn = useRef<Map<string, any>>(new Map())
  const initialized = useRef(false)

  const [state, setState] = useState<'loading' | 'unsupported' | 'empty' | 'error' | 'ready'>('loading')
  const [models, setModels] = useState<CoordModel[]>([])
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [selectedUrn, setSelectedUrn] = useState<string>('')
  const [views, setViews] = useState<View3D[]>([])
  const [selectedView, setSelectedView] = useState<string>('')
  const [viewerBusy, setViewerBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchModels(refresh = false): Promise<{ models: CoordModel[]; unsupported?: boolean } | null> {
    try {
      const res = await fetch(`/api/projects/${projectId}/coordination-models${refresh ? '?refresh=1' : ''}`)
      if (!res.ok) return null
      const data = await res.json() as { models?: CoordModel[]; syncedAt?: string; unsupported?: boolean }
      if (data.unsupported) return { models: [], unsupported: true }
      setSyncedAt(data.syncedAt ?? null)
      return { models: data.models ?? [] }
    } catch { return null }
  }

  // The published "EB_3D_*" views carry no camera in the derivative manifest,
  // so after geometry streams in the camera is degenerate (pos == target →
  // "can't invert matrix" and a blank canvas). Frame the model explicitly from
  // its bounding box once geometry is ready.
  function frameModel() {
    const v = viewer.current
    const THREE = (window as any).THREE
    const bb = v?.model?.getBoundingBox?.()
    if (!v || !THREE || !bb || bb.isEmpty?.()) return
    try {
      const c = bb.getCenter(new THREE.Vector3())
      const size = bb.getSize(new THREE.Vector3()).length()
      v.navigation.setCameraUpVector(new THREE.Vector3(0, 0, 1))
      v.navigation.setView(new THREE.Vector3(c.x + size * 0.7, c.y - size * 0.7, c.z + size * 0.5), c)
      v.fitToView()
    } catch { /* */ }
  }

  // Frame now if geometry is already in, otherwise on GEOMETRY_LOADED.
  function frameWhenReady() {
    const v = viewer.current
    const Autodesk = (window as any).Autodesk
    if (!v) return
    if (v.model?.isLoadDone?.()) { frameModel(); return }
    const once = () => { v.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, once); frameModel() }
    v.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, once)
  }

  // Load a model's Document (cached) and enumerate its published 3D views.
  async function openModel(m: CoordModel, viewGuid?: string) {
    const Autodesk = (window as any).Autodesk
    if (!Autodesk || !viewer.current) return
    setViewerBusy(true)
    setSelectedUrn(m.urn)
    try {
      let doc = docByUrn.current.get(m.urn)
      if (!doc) {
        doc = await new Promise<any>((resolve, reject) => {
          Autodesk.Viewing.Document.load(`urn:${m.urn}`, resolve, reject)
        })
        docByUrn.current.set(m.urn, doc)
      }
      const g3: any[] = doc.getRoot().search({ type: 'geometry', role: '3d' })
      const list: View3D[] = g3.map((n: any) => ({ guid: String(n.data?.guid ?? nameOfNode(n)), name: nameOfNode(n), node: n }))
      setViews(list)
      // Default view: the one named like the coordination view, else the first.
      const target = (viewGuid && list.find(v => v.guid === viewGuid))
        ?? list.find(v => /coordination/i.test(v.name))
        ?? list[0]
      if (!target) { setState('error'); return }
      setSelectedView(target.guid)
      await viewer.current.loadDocumentNode(doc, target.node, { keepCurrentModels: false })
      frameWhenReady()
      setState('ready')
    } catch {
      setState('error')
    } finally {
      setViewerBusy(false)
    }
  }

  function switchView(guid: string) {
    const v = views.find(x => x.guid === guid)
    const doc = docByUrn.current.get(selectedUrn)
    if (!v || !doc || !viewer.current) return
    setSelectedView(guid)
    setViewerBusy(true)
    viewer.current.loadDocumentNode(doc, v.node, { keepCurrentModels: false })
      .then(() => frameWhenReady())
      .finally(() => setViewerBusy(false))
  }

  useEffect(() => {
    let cancelled = false
    if (initialized.current) return
    initialized.current = true

    async function init() {
      const result = await fetchModels()
      if (cancelled) return
      if (!result) { setState('error'); return }
      if (result.unsupported) { setState('unsupported'); onUnsupported?.(); return }
      setModels(result.models)
      // No coordination model → no card at all; the updates column widens.
      if (result.models.length === 0) { setState('empty'); onUnsupported?.(); return }

      try {
        await loadViewerSdk()
        if (cancelled || !canvas.current) return
        const Autodesk = (window as any).Autodesk
        await new Promise<void>((resolve, reject) => {
          Autodesk.Viewing.Initializer(
            {
              env: 'AutodeskProduction2', api: 'streamingV2',
              getAccessToken: (cb: (t: string, e: number) => void) => {
                fetch(`/api/projects/${projectId}/viewer-token`)
                  .then(r => r.json()).then(d => cb(d.access_token, d.expires_in)).catch(reject)
              },
            },
            () => resolve(),
          )
        })
        if (cancelled || !canvas.current) return
        const v = new Autodesk.Viewing.GuiViewer3D(canvas.current)
        viewer.current = v; v.start(); try { v.setTheme('light-theme') } catch { /* */ }
        await openModel(result.models[0])
      } catch {
        if (!cancelled) setState('error')
      }
    }

    init()
    return () => {
      cancelled = true
      if (viewer.current) { try { viewer.current.finish() } catch { /* */ } viewer.current = null }
      docByUrn.current = new Map()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function refresh() {
    setRefreshing(true)
    const result = await fetchModels(true)
    if (result && !result.unsupported) setModels(result.models)
    setRefreshing(false)
  }

  // Hidden entirely for unsupported hubs (only EasyBIM/ANA have viewer
  // credentials) and for projects with no coordination model to show.
  if (state === 'unsupported' || state === 'empty') return null

  const selected = models.find(m => m.urn === selectedUrn) ?? models[0] ?? null

  return (
    <div className={`glass-card rounded-2xl p-[15px] flex flex-col gap-2.5 ${className}`}>
      {/* Title row: name · the three dates · sync */}
      <div className="shrink-0 flex items-center gap-3 flex-wrap">
        <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2">
          <Box size={14} className="text-[#44b8d3]" /> Project Model — Coordination
        </h2>
        {selected && (
          <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[10px] text-gray-500">
            <span>Published <b className="text-[#1e248c] font-semibold">{fmtDateTime(selected.publishedAt)}</b>{selected.publishedBy ? <> · {selected.publishedBy}</> : null}</span>
            <span>Last synced to platform <b className="text-[#1e248c] font-semibold">{fmtDateTime(syncedAt)}</b></span>
          </div>
        )}
      </div>

      <>
          {/* Controls row: model (when several) + published 3D view switcher */}
          {selected && (
            <div className="shrink-0 flex items-center gap-2 flex-wrap">
              {models.length > 1 ? (
                <select
                  value={selectedUrn}
                  onChange={e => { const m = models.find(x => x.urn === e.target.value); if (m && !viewerBusy) openModel(m) }}
                  className="text-[11px] max-w-[280px] truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 outline-none focus:border-[#44b8d3]"
                  title="Coordination model"
                >
                  {models.map(m => (
                    <option key={m.urn} value={m.urn}>{m.name}{m.area ? ` (${m.area})` : ''} · v{m.versionNumber}</option>
                  ))}
                </select>
              ) : (
                <span className="text-[11px] font-semibold text-[#1e248c] truncate max-w-[280px]" title={selected.path}>
                  {selected.name} <span className="font-mono text-[9px] text-gray-400">v{selected.versionNumber}</span>
                </span>
              )}
              {selected.processingVersion != null && (
                <span
                  className="text-[9.5px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-px"
                  title="ACC is still translating the newest published version; showing the last translated one meanwhile."
                >
                  v{selected.processingVersion} processing in ACC…
                </span>
              )}
              <div className="flex items-center gap-2.5 ml-auto min-w-0">
                {views.length > 0 && (
                  <>
                    <Eye size={12} className="text-[#44b8d3] shrink-0" />
                    <select
                      value={selectedView}
                      onChange={e => !viewerBusy && switchView(e.target.value)}
                      className="text-[11px] max-w-[220px] truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 outline-none focus:border-[#44b8d3]"
                      title="Published 3D view"
                    >
                      {views.map(v => <option key={v.guid} value={v.guid}>{v.name}</option>)}
                    </select>
                  </>
                )}
                <button
                  onClick={refresh}
                  title="Re-sync from ACC"
                  className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[#1e248c] hover:text-[#44b8d3] transition-colors shrink-0"
                >
                  <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Sync to platform
                </button>
              </div>
            </div>
          )}

          {/* 3D canvas — fills the card's remaining height on lg+. */}
          <div className="relative rounded-xl overflow-hidden border border-[#44b8d3]/30 bg-[#0e1116] h-[420px] lg:h-auto lg:flex-1 lg:min-h-0">
            <div ref={canvas} className="absolute inset-0" />
            {(state === 'loading' || viewerBusy) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/50 backdrop-blur-sm pointer-events-none">
                <Loader2 size={24} className="animate-spin text-[#44b8d3]" />
                <p className="text-xs text-gray-600">Loading…</p>
              </div>
            )}
            {state === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60">
                <AlertCircle size={24} className="text-amber-500" />
                <p className="text-xs text-gray-600">Couldn&apos;t load the model.</p>
              </div>
            )}
          </div>
      </>
    </div>
  )
}
