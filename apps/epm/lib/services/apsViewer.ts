// APS Model Viewer support for the ANA combined-model card.
//
// Everything here runs with the ANA hub's 2-legged credentials (Custom
// Integration on the ANA ACC account), so no per-client Autodesk login is
// needed: EPM discovers the project's 3D models inside the ACC "02_Shared"
// folder, confirms they're translated via Model Derivative, and hands the
// browser Viewer a short-lived 2-legged token (data:read viewables:read).

import type { ApsHub } from '@/lib/services/apsHubs'

const APS_AUTH_URL = 'https://developer.api.autodesk.com/authentication/v2/token'
const DM_BASE = 'https://developer.api.autodesk.com/data/v1'
const PROJECT_BASE = 'https://developer.api.autodesk.com/project/v1'
const MD_BASE = 'https://developer.api.autodesk.com/modelderivative/v2/designdata'

// 3D model file types for the combined view (Revit / Navisworks / IFC). 2D
// sheets (dwg/pdf) are excluded — they aren't part of the 3D federation.
const MODEL_EXT_RE = /\.(rvt|nwd|nwc|ifc)$/i
const PDF_EXT_RE = /\.pdf$/i
// The single ACC folder whose models we surface. Its parent varies per project
// ("00_Project Files" / "00_Project Standard"), so we match it by name anywhere
// under Project Files: "02_Shared", "02 Shared", "2_shared", …
const SHARED_FOLDER_RE = /0?2[_\s-]*shared/i
// Within 02_Shared, only these discipline sub-folders carry the models we want:
// 02.1-תכנון (design) and 02.3-אחזקה ותפעול (maintenance/existing). Everything
// else (02.4 project-management title blocks, 02.5 permits, …) is skipped.
const ALLOWED_SUBFOLDER_RE = /^0?2\.(1|3)\b/

const DOCS_BASE = 'https://developer.api.autodesk.com/bim360/docs/v1'

export interface ViewerModel {
  name: string
  urn: string                       // base64url derivative URN, ready for Document.load('urn:'+urn)
  path: string                      // folder path relative to 02_Shared
  copiedTime: string | null         // ISO — the tip version's create ("Copied on") time
  copiedBy: string | null           // who copied/created the tip version
  accUrl: string | null             // ACC Docs deep-link to the file
  description: string | null        // ACC Files "Description" (custom attribute), if set
}

// A PDF drawing from a 02_Shared discipline PDF folder (e.g. 02.1.3.2-PDF).
export interface PdfDrawing {
  name: string
  urn: string                       // base64url derivative URN (translated → 2D viewable)
  discipline: string                // Architecture / Structural / … (from the folder)
  path: string
}

// Discipline label from a 02_Shared folder path (numeric code or Hebrew name).
const DISCIPLINE_BY_PATH: Array<[RegExp, string]> = [
  [/02\.\d\.1\b|אדריכל/, 'Architecture'],
  [/02\.\d\.2\b|קונסטרוקצ/, 'Structural'],
  [/02\.\d\.3\b|חשמל/, 'Electrical'],
  [/02\.\d\.4\b|אינסטלצ/, 'Plumbing'],
  [/02\.\d\.5\b|מיזוג/, 'Mechanical'],
  [/02\.3\b|אחזקה|מודלים|exist/i, 'Existing'],
]
function disciplineFromPath(path: string): string {
  for (const [re, label] of DISCIPLINE_BY_PATH) if (re.test(path)) return label
  return 'Other'
}

// ── Viewer token (2-legged, data:read viewables:read) ────────────────────────
const viewerTokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getApsViewerToken(hub: ApsHub): Promise<{ access_token: string; expires_in: number }> {
  const cached = viewerTokenCache.get(hub.key)
  const now = Date.now()
  if (cached && now < cached.expiresAt - 60_000) {
    return { access_token: cached.token, expires_in: Math.floor((cached.expiresAt - now) / 1000) }
  }
  const res = await fetch(APS_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'data:read viewables:read',
      client_id: hub.clientId,
      client_secret: hub.clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`APS viewer token failed (${hub.key}): ${res.status}`)
  const json = await res.json() as { access_token: string; expires_in: number }
  viewerTokenCache.set(hub.key, { token: json.access_token, expiresAt: now + json.expires_in * 1000 })
  return json
}

// ── Model discovery ──────────────────────────────────────────────────────────
type DmEntity = {
  id: string
  type: string
  attributes?: {
    name?: string
    displayName?: string
    createTime?: string
    createUserName?: string
  }
  links?: { webView?: { href?: string } }
  relationships?: { item?: { data?: { id?: string } }; derivatives?: { data?: { id?: string } } }
}
type DmContents = { data?: DmEntity[]; included?: DmEntity[] }

// One raw hit before translation-check / dedupe.
type RawModel = ViewerModel & { versionNumber: number; versionUrn: string }

export interface SharedDrawings { models: ViewerModel[]; pdfs: PdfDrawing[] }
const modelsCache = new Map<string, { data: SharedDrawings; expiresAt: number }>()
const MODELS_TTL = 5 * 60_000

async function dmGet<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

async function folderContents(projId: string, folderId: string, token: string): Promise<DmContents> {
  const url = `${DM_BASE}/projects/${projId}/folders/${encodeURIComponent(folderId)}/contents?page[limit]=200`
  return (await dmGet<DmContents>(url, token)) ?? { data: [], included: [] }
}

const folderName = (e: DmEntity) => e.attributes?.displayName ?? e.attributes?.name ?? ''

// Locate the "02_Shared" folder under Project Files (BFS, bounded). Returns its
// id, or null if the project has no such folder.
async function findSharedFolder(projId: string, token: string, hub: ApsHub, accProjectId: string): Promise<string | null> {
  const hubId = 'b.' + hub.accountId
  const top = await dmGet<{ data?: DmEntity[] }>(
    `${PROJECT_BASE}/hubs/${hubId}/projects/b.${accProjectId}/topFolders`, token,
  )
  const roots = (top?.data ?? []).filter(f => folderName(f) === 'Project Files')
  const queue = (roots.length ? roots : (top?.data ?? [])).map(f => f.id)
  let visited = 0
  while (queue.length && visited < 40) {
    const fid = queue.shift() as string
    visited += 1
    const c = await folderContents(projId, fid, token)
    for (const e of c.data ?? []) {
      if (e.type !== 'folders') continue
      if (SHARED_FOLDER_RE.test(folderName(e))) return e.id
      queue.push(e.id)
    }
  }
  return null
}

// Recursively collect model-extension items (with version metadata + relative
// path) under a folder tree. Bounded by depth and a visited-folder budget.
async function collectModels(
  projId: string, folderId: string, token: string, depth: number,
  relPath: string, budget: { folders: number }, out: RawModel[], pdfsOut: PdfDrawing[],
): Promise<void> {
  if (depth > 6 || budget.folders <= 0) return
  budget.folders -= 1
  const c = await folderContents(projId, folderId, token)
  const versionByItem = new Map<string, DmEntity>()
  for (const inc of c.included ?? []) {
    const itemId = inc.relationships?.item?.data?.id
    if (inc.type === 'versions' && itemId) versionByItem.set(itemId, inc)
  }
  for (const e of c.data ?? []) {
    const nm = folderName(e)
    if (e.type === 'folders') {
      await collectModels(projId, e.id, token, depth + 1, relPath ? `${relPath}/${nm}` : nm, budget, out, pdfsOut)
    } else if (e.type === 'items' && PDF_EXT_RE.test(nm)) {
      const urn = versionByItem.get(e.id)?.relationships?.derivatives?.data?.id
      if (urn) pdfsOut.push({ name: nm, urn, path: relPath, discipline: disciplineFromPath(relPath) })
    } else if (e.type === 'items' && MODEL_EXT_RE.test(nm)) {
      const v = versionByItem.get(e.id)
      const urn = v?.relationships?.derivatives?.data?.id
      if (!urn) continue
      out.push({
        name: nm,
        urn,
        path: relPath,
        copiedTime: v?.attributes?.createTime ?? null,
        copiedBy: v?.attributes?.createUserName ?? null,
        accUrl: e.links?.webView?.href ?? null,
        description: null,
        versionNumber: Number(
          (v?.attributes as { versionNumber?: number } | undefined)?.versionNumber ?? 0,
        ),
        versionUrn: v?.id ?? '',
      })
    }
  }
}

async function isTranslated(urn: string, token: string): Promise<boolean> {
  const man = await dmGet<{ status?: string }>(`${MD_BASE}/${urn}/manifest`, token)
  return man?.status === 'success'
}

// ACC Files "Description" comes from a project custom attribute named
// "Description" (the editable column in ACC Docs). Batch-get the versions and
// pull that attribute's value. Returns versionUrn → description for any that set
// one. Empty map when the project defines no such attribute / none are set.
type DocsVersionResult = {
  urn?: string
  description?: unknown
  customAttributes?: Array<{ name?: string; value?: unknown }>
}
async function fetchDescriptions(
  accProjectId: string, versionUrns: string[], token: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const urns = versionUrns.filter(Boolean)
  if (urns.length === 0) return map
  try {
    const res = await fetch(`${DOCS_BASE}/projects/${accProjectId}/versions:batch-get`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urns }),
    })
    if (!res.ok) return map
    const json = await res.json() as { results?: DocsVersionResult[] }
    for (const r of json.results ?? []) {
      // Built-in "Description" field, if the API returns one directly…
      let val = typeof r.description === 'string' ? r.description.trim() : ''
      // …otherwise a custom attribute named "Description".
      if (!val) {
        const attr = (r.customAttributes ?? []).find(a => /description/i.test(a.name ?? ''))
        if (attr?.value != null) val = String(attr.value).trim()
      }
      if (r.urn && val) map.set(r.urn, val)
    }
  } catch { /* best-effort */ }
  return map
}

/**
 * The translated 3D models inside a project's "02_Shared" ACC folder, ready to
 * load in the Viewer. Returns `[]` when there's no 02_Shared folder / no models
 * / on any ACC error. Cached 5 min. Deduped by file name, keeping the newest
 * version (same model can live in multiple sub-folders at different versions).
 */
export async function listViewableModels(
  accProjectId: string, hub: ApsHub, descToken?: string,
): Promise<SharedDrawings> {
  // ACC Docs descriptions/custom attributes are permission-scoped: only a
  // 3-legged user token can read them (the 2-legged app sees nothing). Cache
  // separately so an unauthenticated (no-description) result never masks the
  // authenticated one.
  const cacheKey = `${hub.key}:${accProjectId}:${descToken ? 'u' : 'a'}`
  const cached = modelsCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  try {
    const { access_token: token } = await getApsViewerToken(hub)
    const projId = 'b.' + accProjectId

    const sharedId = await findSharedFolder(projId, token, hub, accProjectId)
    if (!sharedId) {
      const empty = { models: [], pdfs: [] }
      modelsCache.set(cacheKey, { data: empty, expiresAt: Date.now() + MODELS_TTL })
      return empty
    }

    // Walk only the allowed discipline sub-folders of 02_Shared (02.1 / 02.3).
    const shared = await folderContents(projId, sharedId, token)
    const found: RawModel[] = []
    const pdfsRaw: PdfDrawing[] = []
    const budget = { folders: 80 }
    for (const sub of shared.data ?? []) {
      if (sub.type !== 'folders') continue
      const subName = folderName(sub)
      if (!ALLOWED_SUBFOLDER_RE.test(subName)) continue
      await collectModels(projId, sub.id, token, 1, subName, budget, found, pdfsRaw)
    }

    // Keep only translated (viewable) models — dedupe exact URN repeats first.
    const byUrn = new Map(found.map(m => [m.urn, m]))
    const checked = await Promise.all(
      [...byUrn.values()].map(async m => (await isTranslated(m.urn, token)) ? m : null),
    )
    const translated = checked.filter((m): m is RawModel => m !== null)

    // Collapse to one entry per file name, keeping the newest version (distinct
    // names are distinct disciplines and all load). Capped for the viewer.
    const MAX_MODELS = 15
    const byName = new Map<string, RawModel>()
    for (const m of translated) {
      const key = m.name.trim().toLowerCase()
      const prev = byName.get(key)
      if (!prev || m.versionNumber > prev.versionNumber) byName.set(key, m)
    }
    const finalRaw = [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_MODELS)

    // Enrich with the ACC Files "Description". ACC Docs metadata is permission-
    // scoped, so this usually needs a 3-legged user token; fall back to the
    // 2-legged token (works only if the app has Docs access on the account).
    const descByVersion = await fetchDescriptions(
      accProjectId, finalRaw.map(m => m.versionUrn), descToken ?? token,
    )

    const models: ViewerModel[] = finalRaw.map(
      ({ name, urn, path, copiedTime, copiedBy, accUrl, versionUrn }) => ({
        name, urn, path, copiedTime, copiedBy, accUrl,
        description: descByVersion.get(versionUrn) ?? null,
      }),
    )

    // PDFs: dedupe by name, keep only translated (viewable) ones.
    const pdfByName = new Map<string, PdfDrawing>()
    for (const p of pdfsRaw) if (!pdfByName.has(p.name.toLowerCase())) pdfByName.set(p.name.toLowerCase(), p)
    const pdfChecked = await Promise.all(
      [...pdfByName.values()].map(async p => (await isTranslated(p.urn, token)) ? p : null),
    )
    const pdfs = pdfChecked
      .filter((p): p is PdfDrawing => p !== null)
      .sort((a, b) => a.discipline.localeCompare(b.discipline) || a.name.localeCompare(b.name))

    const data: SharedDrawings = { models, pdfs }
    modelsCache.set(cacheKey, { data, expiresAt: Date.now() + MODELS_TTL })
    return data
  } catch (err) {
    console.warn('[apsViewer] listViewableModels failed:', err)
    return { models: [], pdfs: [] }
  }
}
