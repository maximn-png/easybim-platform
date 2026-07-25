'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Box, Loader2, AlertCircle, Eye, EyeOff, ExternalLink, Focus, FileText, Info, MessageSquare, Check, Lock } from 'lucide-react'

// Autodesk Viewer SDK (v7) — loaded from Autodesk's CDN on demand. The global
// `Autodesk` namespace is injected by the script, so it's typed as `any` here.
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

type Status = 'loading' | 'empty' | 'error' | 'ready'
interface Model {
  name: string; urn: string; path: string
  copiedTime: string | null; copiedBy: string | null
  accUrl: string | null; description: string | null
}
interface Sheet { key: string; label: string; model: string; type: string }
interface Pdf { name: string; urn: string; discipline: string; path: string }

const nameOfNode = (n: any) => String((typeof n?.name === 'function' ? n.name() : n?.data?.name) ?? '')
// Architecture model: lives in the 02.1.1-אדריכלות folder (path), or "-AR-" in name.
const isArModel = (m: { name: string; path: string }) =>
  /02\.1\.1|אדריכלות/.test(m.path) || /(^|[-_ ])ar([-_ ]|$)/i.test(m.name)

// Discipline (model type) derived from a token in the model name. "Existing" is
// matched first because "EXIST" would otherwise trip the "EX" check.
const DISCIPLINES: Array<[RegExp, string, string]> = [
  [/exist|(^|[-_ ])ex([-_ ]|$)/i, 'Existing',     'bg-slate-100 text-slate-600 border-slate-200'],
  [/(^|[-_ ])pl([-_ ]|$)/i,        'Plumbing',     'bg-sky-50 text-sky-700 border-sky-200'],
  [/(^|[-_ ])ar([-_ ]|$)/i,        'Architecture', 'bg-indigo-50 text-indigo-700 border-indigo-200'],
  [/(^|[-_ ])me([-_ ]|$)/i,        'Mechanical',   'bg-teal-50 text-teal-700 border-teal-200'],
  [/(^|[-_ ])st([-_ ]|$)/i,        'Structural',   'bg-amber-50 text-amber-700 border-amber-200'],
  [/(^|[-_ ])el([-_ ]|$)/i,        'Electrical',   'bg-yellow-50 text-yellow-700 border-yellow-200'],
]
function modelType(name: string): { label: string; cls: string } | null {
  for (const [re, label, cls] of DISCIPLINES) if (re.test(name)) return { label, cls }
  return null
}

// Ready-made Hebrew messages the reviewer can copy to send the client (email / WhatsApp).
const MSG = {
  missingModel: {
    subject: 'עדכון והעלאת מודל לסביבת Shared (ענן Forma)',
    text: 'נושא: עדכון והעלאת מודל לסביבת Shared (ענן Forma)\n\nלא נמצא מודל מעודכן בסביבת ה-Shared בענן Forma.\nאנא דאגו לסנכרן את המודל בסביבת ה-WIP, לפרסם (Publish) אותו, לבצע Transmittal, ולהעתיקו לסביבת ה-Shared.\nיש לבצע תהליך זה בהתאם להנחיות המפורטות במסמך 302-SMP-ACC Guidelines (נמצא בתיקייה 02.4.6.1).',
  },
  wrong3dView: {
    subject: 'עדכון תצוגת מבט תלת-ממדי (3D View)',
    text: 'נושא: עדכון תצוגת מבט תלת-ממדי (3D View)\n\nהמבט התלת-ממדי שפורסם אינו תואם לסטנדרטים הנדרשים בפרויקט.\nאנא הגדירו ופרסמו את המבט מחדש על פי הנחיות מנהל המודל.\nלפירוט ההנחיות המלאות, ניתן לעיין במסמך ה-BEP הנמצא בתיקייה 02.4.6 בענן.',
  },
  missingSheets: {
    subject: 'גיליונות עבודה (Sheets) חסרים במודל',
    text: 'נושא: גיליונות עבודה (Sheets) חסרים במודל\n\nגיליונות העבודה הקיימים במודל ה-Revit שלכם אינם מופיעים בענן.\nאנא פרסמו (Publish) את המודל מחדש, וודאו שסט הפרסום כולל את כלל הגיליונות הנדרשים.\nלהנחיות מדויקות לגבי אופן הפרסום, אנא עיינו במסמך 302-SMP-ACC Guidelines (תיקייה 02.4.6.1) ובמסמך ה-BEP (תיקייה 02.4.6).',
  },
  missingPdf: {
    subject: 'העלאת קובצי PDF של התוכניות',
    text: 'נושא: העלאת קובצי PDF של התוכניות\n\nטרם הועלו קובצי PDF של התוכניות לפרויקט.\nאנא הפיקו את הקבצים והעלו אותם לתיקיית ה-PDF תחת סביבת Shared.\nשימו לב: יש להקפיד על מתן שמות תקניים ואחידים לקבצים, בהתאם למפורט במסמך 400-TEM-TIDPMIDP.',
  },
} as const

// Force RTL base direction on copied/tooltip Hebrew by prefixing each line with a
// RIGHT-TO-LEFT MARK, so it pastes correctly into LTR-default editors (Gmail/WhatsApp).
const RLM = '‏'
const rtlText = (s: string) => s.split('\n').map(l => RLM + l).join('\n')

// Small "copy this message to clipboard" button (for pasting into email / WhatsApp).
function CopyMsgButton({ msg, label, iconSize = 14 }: { msg: { subject: string; text: string }; label?: string; iconSize?: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard?.writeText(rtlText(msg.text))
          .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })
          .catch(() => { /* clipboard blocked */ })
      }}
      title={`${RLM}העתקת הודעה: ${msg.subject}`}
      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 hover:text-amber-600 transition-colors shrink-0"
    >
      {copied ? <Check size={iconSize} className="text-green-600" /> : <MessageSquare size={iconSize} />}
      {(label || copied) && <span dir="rtl" className={copied ? 'text-green-600' : 'text-amber-600'}>{copied ? 'הועתק' : label}</span>}
    </button>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Render an ACC folder path as an LTR breadcrumb, isolating each segment so mixed
// Hebrew/English/number names don't reorder into an unreadable string.
function PathTrail({ path }: { path: string }) {
  const segs = path.split('/').filter(Boolean)
  if (segs.length === 0) return <span className="text-gray-300">—</span>
  return (
    <span dir="ltr" className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {segs.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-gray-300">›</span>}
          <bdi className="text-gray-500">{seg}</bdi>
        </span>
      ))}
    </span>
  )
}

function Overlay({ status, kind }: { status: Status; kind: '3d' | '2d' }) {
  if (status === 'ready') return null
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center bg-white/50 backdrop-blur-sm">
      {status === 'loading' && (<><Loader2 size={24} className="animate-spin text-[#44b8d3]" /><p className="text-xs text-gray-600">Loading…</p></>)}
      {status === 'empty' && (<>{kind === '3d' ? <Box size={26} className="text-[#44b8d3]/50" /> : <FileText size={26} className="text-[#44b8d3]/50" />}<p className="text-xs text-gray-500 px-4">{kind === '3d' ? 'No 3D model in 02_Shared.' : 'No 2D drawings in these models.'}</p></>)}
      {status === 'error' && (<><AlertCircle size={24} className="text-amber-500" /><p className="text-xs text-gray-600">Couldn’t load.</p></>)}
    </div>
  )
}

export default function CombinedModelViewer({
  projectId, formsPanel, activityPanel,
}: {
  projectId: string
  formsPanel?: ReactNode      // rendered under the 3D Models viewer
  activityPanel?: ReactNode   // rendered under the 2D Drawings viewer
}) {
  const c3 = useRef<HTMLDivElement>(null)
  const c2 = useRef<HTMLDivElement>(null)
  const v3 = useRef<any>(null)
  const v2 = useRef<any>(null)
  const modelByUrn = useRef<Map<string, any>>(new Map())   // urn → loaded 3D model
  const docByUrn = useRef<Map<string, any>>(new Map())     // urn → loaded Document
  const sheetNodeByKey = useRef<Map<string, any>>(new Map())// sheet key → 2D BubbleNode
  const sheetKeysByUrn = useRef<Map<string, string[]>>(new Map()) // urn → its sheet keys
  const urnByModelId = useRef<Map<number, string>>(new Map())// 3D model.id → urn
  const currentSheetUrn = useRef<string>('')               // urn of the model shown in the 2D panel
  const syncing = useRef<boolean>(false)                   // guards the 2D↔3D selection loop

  const [status, setStatus] = useState<Status>('loading')
  const [status2d, setStatus2d] = useState<Status>('loading')
  const [models, setModels] = useState<Model[]>([])
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [viewName, setViewName] = useState<Record<string, string>>({})
  const [selectedUrn, setSelectedUrn] = useState<string | null>(null)
  const [isolatedUrn, setIsolatedUrn] = useState<string | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [pdfs, setPdfs] = useState<Pdf[]>([])
  const [selectedPdf, setSelectedPdf] = useState<string>('')
  const [pdfPages, setPdfPages] = useState<string[]>([])   // page labels of the open PDF
  const [selectedPage, setSelectedPage] = useState<number>(0)
  const pdfDoc = useRef<any>(null)                         // currently-open PDF Document
  const pdfPageNodes = useRef<any[]>([])                   // its per-page 2D nodes
  // Which 2D source is shown: Revit working sheets or the ACC PDF drawings.
  const [drawMode, setDrawMode] = useState<'sheets' | 'pdf'>('sheets')
  // True when there's no 3-legged ANA token → descriptions/issues can't load.
  const [needsAccAuth, setNeedsAccAuth] = useState(false)
  // urn → is the info/details panel open for this row?
  const [infoOpen, setInfoOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    modelByUrn.current = new Map(); docByUrn.current = new Map(); sheetNodeByKey.current = new Map()
    sheetKeysByUrn.current = new Map(); urnByModelId.current = new Map(); syncing.current = false

    async function init() {
      try {
        const res = await fetch(`/api/ana/projects/${projectId}/models`)
        const data = await res.json() as { models?: Model[]; pdfs?: Pdf[]; needsAccAuth?: boolean }
        const list = data.models ?? []
        if (cancelled) return
        setModels(list)
        setPdfs(data.pdfs ?? [])
        setNeedsAccAuth(!!data.needsAccAuth)
        if (list.length === 0) { setStatus('empty'); setStatus2d('empty'); return }

        // Load the AR (architecture) model FIRST so the Levels floor-selector binds
        // to its levels rather than merging every discipline's levels.
        const ordered = [...list].sort((a, b) => (isArModel(b) ? 1 : 0) - (isArModel(a) ? 1 : 0))

        await loadViewerSdk()
        if (cancelled || !c3.current) return
        const Autodesk = (window as any).Autodesk

        await new Promise<void>((resolve, reject) => {
          Autodesk.Viewing.Initializer(
            {
              env: 'AutodeskProduction2', api: 'streamingV2',
              getAccessToken: (cb: (t: string, e: number) => void) => {
                fetch('/api/ana/viewer-token').then(r => r.json()).then(d => cb(d.access_token, d.expires_in)).catch(reject)
              },
            },
            () => resolve(),
          )
        })
        if (cancelled || !c3.current) return

        const viewer = new Autodesk.Viewing.GuiViewer3D(c3.current)
        v3.current = viewer; viewer.start(); try { viewer.setTheme('light-theme') } catch { /* */ }
        let viewer2: any = null
        if (c2.current) {
          viewer2 = new Autodesk.Viewing.GuiViewer3D(c2.current)
          v2.current = viewer2; viewer2.start(); try { viewer2.setTheme('light-theme') } catch { /* */ }
        }

        let sharedOffset: any = null
        let loaded = 0
        let arModel: any = null
        const sheetList: Sheet[] = []

        for (const m of ordered) {
          if (cancelled) return
          await new Promise<void>((resolve) => {
            Autodesk.Viewing.Document.load(
              `urn:${m.urn}`,
              async (doc: any) => {
                // Only the AR model contributes levels: AEC (level) data is
                // downloaded AND applyRefPoint is applied ONLY for it, so the floor
                // selector lists AR levels alone. Other models load at the AR
                // model's shared globalOffset (federated), no AEC data.
                const ar = isArModel(m)
                if (ar) { try { await doc.downloadAecModelData?.() } catch { /* */ } }
                docByUrn.current.set(m.urn, doc)
                const root = doc.getRoot()

                // Collect this model's 2D sheets for the Drawings panel.
                const g2: any[] = root.search({ type: 'geometry', role: '2d' })
                const keysForUrn: string[] = []
                const mType = modelType(m.name)?.label ?? m.name
                g2.forEach((n, idx) => {
                  const key = `${m.urn}::${idx}`
                  sheetNodeByKey.current.set(key, n)
                  keysForUrn.push(key)
                  sheetList.push({ key, label: nameOfNode(n) || `Sheet ${idx + 1}`, model: m.name, type: mType })
                })
                if (keysForUrn.length) sheetKeysByUrn.current.set(m.urn, keysForUrn)

                // Choose the 3D view: discipline "Publish 3D XX" > "Publish 3D all" > any 3D.
                const g3: any[] = root.search({ type: 'geometry', role: '3d' })
                const key = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '')
                const node =
                  g3.find(n => { const k = key(nameOfNode(n)); return k.startsWith('publish3d') && k !== 'publish3dall' })
                  ?? g3.find(n => key(nameOfNode(n)) === 'publish3dall')
                  ?? g3[0] ?? null
                if (!node) { resolve(); return }
                const shownView = nameOfNode(node)

                const opts: any = { keepCurrentModels: true }
                if (ar) opts.applyRefPoint = true
                if (sharedOffset) opts.globalOffset = sharedOffset
                viewer.loadDocumentNode(doc, node, opts)
                  .then((model: any) => {
                    if (!sharedOffset) { try { sharedOffset = model.getData()?.globalOffset ?? null } catch { /* */ } }
                    if (!arModel && ar) arModel = model
                    modelByUrn.current.set(m.urn, model)
                    urnByModelId.current.set(model.id, m.urn)
                    setVisible(prev => ({ ...prev, [m.urn]: true }))
                    setViewName(prev => ({ ...prev, [m.urn]: shownView }))
                    loaded += 1
                    resolve()
                  })
                  .catch(() => resolve())
              },
              () => resolve(),
            )
          })
        }
        if (cancelled) return
        try { viewer.fitToView() } catch { /* */ }

        // Bind the Levels floor-selector to the AR model only (best-effort).
        try {
          const ext = viewer.getExtension('Autodesk.AEC.LevelsExtension')
          const target = arModel ?? modelByUrn.current.values().next().value
          if (ext && target) {
            if (typeof ext.setCurrentModel === 'function') ext.setCurrentModel(target)
            else if (ext.floorSelector?.setFloorData) { /* handled internally by setCurrentModel */ }
          }
        } catch { /* levels not critical */ }

        setStatus(loaded > 0 ? 'ready' : 'error')

        // Cross-highlight 2D ↔ 3D: a Revit model's 2D sheet and 3D view share
        // dbIds, so selecting an element in one selects the same element in the
        // other (only for the model currently shown in the 2D panel).
        if (viewer2) {
          const SEL = Autodesk.Viewing.SELECTION_CHANGED_EVENT
          // 2D → 3D: highlight + frame the same element in the 3D model.
          viewer2.addEventListener(SEL, (ev: any) => {
            if (syncing.current) return
            const m3 = modelByUrn.current.get(currentSheetUrn.current)
            if (!m3) return
            syncing.current = true
            try {
              const ids = ev.dbIdArray ?? []
              viewer.select(ids, m3)
              if (ids.length) viewer.fitToView(ids, m3)
            } catch { /* */ }
            syncing.current = false
          })
          // 3D → 2D: open the selected model's drawing (switching sheet if needed)
          // and highlight the element there.
          viewer.addEventListener(SEL, (ev: any) => {
            if (syncing.current || !ev.model) return
            const urn = urnByModelId.current.get(ev.model.id)
            if (!urn) return
            const ids = ev.dbIdArray ?? []
            if (currentSheetUrn.current === urn) {
              syncing.current = true
              try { viewer2.select(ids) } catch { /* */ }
              syncing.current = false
            } else {
              const keys = sheetKeysByUrn.current.get(urn)
              if (keys && keys.length) {
                syncing.current = true            // cleared inside loadSheet's async
                loadSheet(keys[0], ids)
              }
            }
          })
        }

        // 2D drawings panel
        setSheets(sheetList)
        if (viewer2 && sheetList.length > 0) {
          setStatus2d('ready')
          loadSheet(sheetList[0].key)
        } else {
          setStatus2d('empty')
        }
      } catch {
        if (!cancelled) { setStatus('error'); setStatus2d('error') }
      }
    }

    init()
    return () => {
      cancelled = true
      if (v3.current) { try { v3.current.finish() } catch { /* */ } v3.current = null }
      if (v2.current) { try { v2.current.finish() } catch { /* */ } v2.current = null }
      modelByUrn.current = new Map(); docByUrn.current = new Map(); sheetNodeByKey.current = new Map()
    }
  }, [projectId])

  function loadSheet(key: string, selectDbIds?: number[]) {
    const viewer2 = v2.current
    const node = sheetNodeByKey.current.get(key)
    const urn = key.split('::')[0]
    const doc = docByUrn.current.get(urn)
    if (!viewer2 || !node || !doc) { syncing.current = false; return }
    try {
      const p = viewer2.loadDocumentNode(doc, node, { keepCurrentModels: false })
      currentSheetUrn.current = urn
      setSelectedSheet(key)
      if (p?.then) {
        p.then(() => {
          try { if (selectDbIds && selectDbIds.length) viewer2.select(selectDbIds) } catch { /* */ }
          syncing.current = false
        }).catch(() => { syncing.current = false })
      } else {
        syncing.current = false
      }
    } catch { syncing.current = false }
  }

  // Load a PDF drawing (on demand). A PDF often has several pages (each a 2D
  // viewable) — enumerate them so the user can page through, and open page 1.
  function loadPdf(urn: string) {
    const viewer2 = v2.current
    if (!viewer2) return
    const Autodesk = (window as any).Autodesk
    setSelectedPdf(urn)
    setPdfPages([]); setSelectedPage(0)
    pdfDoc.current = null; pdfPageNodes.current = []
    currentSheetUrn.current = ''   // a PDF isn't a 3D model → no cross-highlight
    Autodesk.Viewing.Document.load(
      `urn:${urn}`,
      (doc: any) => {
        const pages: any[] = doc.getRoot().search({ type: 'geometry', role: '2d' })
        pdfDoc.current = doc
        pdfPageNodes.current = pages
        setPdfPages(pages.map((n, i) => nameOfNode(n) || `Page ${i + 1}`))
        setSelectedPage(0)
        const first = pages[0] ?? doc.getRoot().getDefaultGeometry()
        if (first) { try { viewer2.loadDocumentNode(doc, first, { keepCurrentModels: false }) } catch { /* */ } }
      },
      () => { /* ignore */ },
    )
  }

  // Switch to another page of the already-open PDF.
  function loadPdfPage(i: number) {
    const viewer2 = v2.current
    const node = pdfPageNodes.current[i]
    if (!viewer2 || !pdfDoc.current || !node) return
    setSelectedPage(i)
    try { viewer2.loadDocumentNode(pdfDoc.current, node, { keepCurrentModels: false }) } catch { /* */ }
  }

  // Switch the 2D panel between working sheets and PDF drawings.
  function switchDrawMode(mode: 'sheets' | 'pdf') {
    setDrawMode(mode)
    if (mode === 'pdf') {
      if (pdfs.length > 0) loadPdf(selectedPdf || pdfs[0].urn)
    } else {
      const key = selectedSheet || sheets[0]?.key
      if (key) loadSheet(key)
    }
  }

  function toggleModel(urn: string) {
    const viewer = v3.current; const model = modelByUrn.current.get(urn)
    if (!viewer || !model) return
    const next = !visible[urn]
    try {
      if (next) viewer.showModel(model.id); else viewer.hideModel(model.id)
      setVisible(prev => ({ ...prev, [urn]: next })); setIsolatedUrn(null)
    } catch { /* */ }
  }

  function setAll(show: boolean) {
    const viewer = v3.current; if (!viewer) return
    const next: Record<string, boolean> = {}
    for (const [urn, model] of modelByUrn.current.entries()) {
      try { if (show) viewer.showModel(model.id); else viewer.hideModel(model.id) } catch { /* */ }
      next[urn] = show
    }
    setVisible(next); setIsolatedUrn(null)
  }

  function selectModel(urn: string) {
    const viewer = v3.current; const model = modelByUrn.current.get(urn)
    if (!viewer || !model) return
    try {
      if (!visible[urn]) { viewer.showModel(model.id); setVisible(prev => ({ ...prev, [urn]: true })) }
      const rootId = model.getInstanceTree?.()?.getRootId?.()
      if (rootId != null) { viewer.select([rootId], model); viewer.fitToView([rootId], model) }
      setSelectedUrn(urn)
    } catch { /* */ }
  }

  function isolateModel(urn: string) {
    const viewer = v3.current; if (!viewer) return
    if (isolatedUrn === urn) { setAll(true); return }
    const next: Record<string, boolean> = {}
    for (const [u, model] of modelByUrn.current.entries()) {
      const show = u === urn
      try { if (show) viewer.showModel(model.id); else viewer.hideModel(model.id) } catch { /* */ }
      next[u] = show
    }
    setVisible(next)
    const model = modelByUrn.current.get(urn)
    if (model) {
      try {
        const rootId = model.getInstanceTree?.()?.getRootId?.()
        if (rootId != null) { viewer.select([rootId], model); viewer.fitToView([rootId], model) }
      } catch { /* */ }
    }
    setSelectedUrn(urn); setIsolatedUrn(urn)
  }

  const loadedUrns = Object.keys(visible)
  const anyVisible = loadedUrns.some(u => visible[u])

  return (
    <div className="flex flex-col gap-4">
      {/* Connect prompt — issue status & model descriptions need a 3-legged ANA login. */}
      {needsAccAuth && (
        <a
          href={`/api/auth/autodesk?returnTo=/ana/${projectId}&hub=ana`}
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <Lock size={14} className="shrink-0" />
          Connect Autodesk (ANA) to load issue status and model descriptions
          <span className="ml-auto text-amber-600">Connect →</span>
        </a>
      )}
      {/* Row: model list (left) + the two viewers (right, stretched). */}
      <div className="flex flex-col lg:flex-row gap-4">
      {/* Viewers — stretched across the remaining width. */}
      <div className="flex-1 min-w-0 grid grid-cols-1 xl:grid-cols-2 gap-3 order-1 lg:order-2">
        {/* 3D Models */}
        <div className="flex flex-col gap-1.5">
          <div className="h-8 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#1e248c] flex items-center gap-1.5"><Box size={13} className="text-[#44b8d3]" /> 3D Models</h3>
            <CopyMsgButton msg={MSG.missingModel} label="מודל חסר" />
          </div>
          <div className="relative rounded-xl overflow-hidden border border-[#44b8d3]/30 bg-[#0e1116] h-[560px]">
            <div ref={c3} className="absolute inset-0" />
            <Overlay status={status} kind="3d" />
          </div>
          {formsPanel && <div className="mt-2">{formsPanel}</div>}
        </div>

        {/* 2D Drawings — mode switch (working sheets / PDF drawings) as the title */}
        <div className="flex flex-col gap-1.5">
          <div className="h-8 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText size={13} className="text-[#44b8d3] shrink-0" />
              <select
                value={drawMode}
                onChange={e => switchDrawMode(e.target.value as 'sheets' | 'pdf')}
                className="text-xs font-semibold text-[#1e248c] bg-transparent border-0 outline-none cursor-pointer"
              >
                <option value="sheets">2D Working Sheets</option>
                <option value="pdf">PDF Drawings</option>
              </select>
              <CopyMsgButton msg={drawMode === 'pdf' ? MSG.missingPdf : MSG.missingSheets} />
            </div>

            {/* Content dropdown(s), grouped by discipline. */}
            <div className="flex items-center gap-1.5 min-w-0">
              {drawMode === 'sheets' && sheets.length > 0 && (
                <select
                  value={selectedSheet}
                  onChange={e => loadSheet(e.target.value)}
                  className="text-[11px] max-w-[220px] truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 outline-none focus:border-[#44b8d3]"
                >
                  {[...new Set(sheets.map(s => s.type))].map(t => (
                    <optgroup key={t} label={t}>
                      {sheets.filter(s => s.type === t).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              )}
              {drawMode === 'pdf' && pdfs.length > 0 && (
                <select
                  value={selectedPdf}
                  onChange={e => loadPdf(e.target.value)}
                  className="text-[11px] max-w-[200px] truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 outline-none focus:border-[#44b8d3]"
                >
                  {[...new Set(pdfs.map(p => p.discipline))].map(d => (
                    <optgroup key={d} label={d}>
                      {pdfs.filter(p => p.discipline === d).map(p => <option key={p.urn} value={p.urn}>{p.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              )}
              {/* Page selector — shown when the open PDF has more than one page. */}
              {drawMode === 'pdf' && pdfPages.length > 1 && (
                <select
                  value={selectedPage}
                  onChange={e => loadPdfPage(Number(e.target.value))}
                  title={`${pdfPages.length} pages`}
                  className="text-[11px] rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-700 outline-none focus:border-[#44b8d3]"
                >
                  {pdfPages.map((p, i) => <option key={i} value={i}>{`${i + 1}/${pdfPages.length} · ${p}`}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-[#44b8d3]/30 bg-white h-[560px]">
            <div ref={c2} className="absolute inset-0" />
            {drawMode === 'pdf'
              ? (pdfs.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center bg-white/60">
                    <FileText size={26} className="text-[#44b8d3]/50" />
                    <p className="text-xs text-gray-500 px-4">The PDF folders in 02_Shared are empty.</p>
                  </div>
                ))
              : <Overlay status={status2d} kind="2d" />}
          </div>
          {activityPanel && <div className="mt-2">{activityPanel}</div>}
        </div>
      </div>

      {/* Left column: model list only. */}
      <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4 order-2 lg:order-1">
      {/* Model list */}
      {models.length > 0 && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/80 border-b border-gray-100">
            <span className="text-[11px] font-medium text-gray-500">{models.length} model{models.length === 1 ? '' : 's'}</span>
            {loadedUrns.length > 0 && (
              <button onClick={() => setAll(!anyVisible)} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#1e248c] hover:text-[#44b8d3] transition-colors">
                {anyVisible ? <EyeOff size={13} /> : <Eye size={13} />}{anyVisible ? 'Hide all' : 'Show all'}
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {models.map(m => {
              const loaded = m.urn in visible
              const isVisible = visible[m.urn]
              const isSelected = selectedUrn === m.urn
              const shownView = viewName[m.urn]
              const type = modelType(m.name)
              return (
                <div
                  key={m.urn}
                  onClick={() => loaded && selectModel(m.urn)}
                  title={loaded ? 'Click to select in the viewer' : undefined}
                  className={`group/row px-3 py-2 transition-colors ${loaded ? 'cursor-pointer' : ''} ${isSelected ? 'bg-[#e7eefe]' : 'bg-white/60 hover:bg-blue-50/50'}`}
                >
                  {/* Collapsed row: controls · model type · date/person (always visible) */}
                  <div className="flex items-center gap-3">
                    {loaded ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={e => { e.stopPropagation(); toggleModel(m.urn) }} title={isVisible ? 'Hide in viewer' : 'Show in viewer'} className={`transition-colors ${isVisible ? 'text-[#1e248c] hover:text-[#44b8d3]' : 'text-gray-300 hover:text-gray-500'}`}>
                          {isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <button onClick={e => { e.stopPropagation(); isolateModel(m.urn) }} title={isolatedUrn === m.urn ? 'Un-isolate — show all models' : 'Isolate — show only this model'} className={`transition-colors ${isolatedUrn === m.urn ? 'text-[#44b8d3]' : 'text-gray-400 hover:text-[#1e248c]'}`}>
                          <Focus size={14} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setInfoOpen(prev => ({ ...prev, [m.urn]: !prev[m.urn] })) }} title="Model details" className={`transition-colors ${infoOpen[m.urn] ? 'text-[#44b8d3]' : 'text-gray-400 hover:text-[#1e248c]'}`}>
                          <Info size={14} />
                        </button>
                        <CopyMsgButton msg={MSG.wrong3dView} iconSize={14} />
                      </div>
                    ) : (
                      <span title="2D file — not shown in the 3D view" className="shrink-0 text-[9px] font-semibold text-gray-400 border border-gray-200 rounded px-1 py-0.5">2D</span>
                    )}

                    <div className="flex-1 min-w-0">
                      {type
                        ? <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${type.cls}`}>{type.label}</span>
                        : <span className="text-[10px] text-gray-400">—</span>}
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end">
                      <div className="flex items-center gap-1">
                        <CopyMsgButton
                          msg={{
                            subject: 'מודל לא עודכן זמן רב',
                            text: `המודל האחרון שהופץ לתיקיית ה-Shared עודכן בתאריך ${fmtDate(m.copiedTime)}.\nלאור הזמן שעבר, אנא דאגו לפרסם (Publish) ולהעלות מודל מעודכן באופן מיידי.`,
                          }}
                          iconSize={13}
                        />
                        <p className="text-[11px] text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(m.copiedTime)}</p>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate max-w-[150px]" title={m.copiedBy ?? ''}>{m.copiedBy || '—'}</p>
                    </div>
                  </div>

                  {/* Details — toggled by the info button: name (ACC link), 3D view, path. */}
                  {infoOpen[m.urn] && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                      <div className="flex items-center gap-2 min-w-0">
                        {m.accUrl ? (
                          <a href={m.accUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open in Autodesk ACC" className="group/lnk inline-flex items-center gap-1 text-xs font-semibold text-[#1e248c] hover:text-[#44b8d3] hover:underline min-w-0">
                            <span className="truncate">{m.name}</span>
                            <ExternalLink size={11} className="shrink-0 opacity-40 group-hover/lnk:opacity-100" />
                          </a>
                        ) : (
                          <span className="text-xs font-semibold text-[#1e248c] truncate">{m.name}</span>
                        )}
                        {shownView && <span title="3D view shown" className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#e7f1fe] text-[#1e248c] border border-[#44b8d3]/20">{shownView}</span>}
                      </div>
                      <div className="text-[10px] mt-0.5"><PathTrail path={m.path} /></div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  )
}
