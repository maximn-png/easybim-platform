// Coordination-model discovery for the internal project page's model viewer.
//
// Hub-aware: EasyBIM projects keep the coordination model in a folder named
// exactly "Coordination" (under RVT Models — e.g. Arena Ashdod's
// ASH_EAB_Arena_M3_CO_R25.rvt); ANA projects keep it under the תאום מערכות
// discipline folder (01.1.7 in WIP and/or its 02.1.7 twin in Shared) — folder
// naming there is inconsistent ("01.1.7 - תאום מערכות", "01.1.תאום מערכות7",
// "01.1.7.1RVT Models", even a mis-numbered "01.1.1.1-RVT Models" child), so
// matching is by Hebrew name OR a loose 0X.1.7 code, never an exact string.
//
// Everything runs with the hub's 2-legged credentials (same pattern as
// apsViewer.ts). The browser Viewer then loads the URN and enumerates the
// model's published 3D views client-side.

import type { ApsHub } from '@/lib/services/apsHubs'
import { getApsViewerToken } from '@/lib/services/apsViewer'

const DM_BASE = 'https://developer.api.autodesk.com/data/v1'
const PROJECT_BASE = 'https://developer.api.autodesk.com/project/v1'
const MD_BASE = 'https://developer.api.autodesk.com/modelderivative/v2/designdata'

const MODEL_EXT_RE = /\.(rvt|nwd|nwc|ifc)$/i
// Folders never worth descending into (archived copies).
const SKIP_FOLDER_RE = /^(old|consumed)$/i
// Fallback for projects WITHOUT a coordination folder (older trees keep the
// combined model under "MEP"/"MEP Coordination"): a coordination-ish token in
// the FILENAME — Zichron7-Co-Basement, BS-EAB-M3-MEP-RVT24, Elazar_CO_R24.
const COORD_NAME_RE = /(^|[-_ ])(co|comb|mep)([-_ .)]|$)/i

export interface CoordinationModel {
  name: string
  urn: string                     // base64url derivative URN for Document.load
  path: string                    // folder path under Project Files
  area: 'WIP' | 'Shared' | null   // which side of the ACC tree it lives on
  versionNumber: number
  publishedAt: string | null      // shown version's createTime — when Publish created it
  publishedBy: string | null
  accModifiedAt: string | null    // shown version's lastModifiedTime in ACC
  accUrl: string | null           // ACC Docs deep-link
  // Set when a NEWER version exists whose translation is still running in ACC
  // — the viewer shows the last translated version meanwhile.
  processingVersion?: number
}

type DmEntity = {
  id: string
  type: string
  attributes?: { name?: string; displayName?: string; createTime?: string; lastModifiedTime?: string; createUserName?: string; versionNumber?: number }
  links?: { webView?: { href?: string } }
  relationships?: { item?: { data?: { id?: string } }; derivatives?: { data?: { id?: string } } }
}
type DmContents = { data?: DmEntity[]; included?: DmEntity[] }

const folderName = (e: DmEntity) => (e.attributes?.displayName ?? e.attributes?.name ?? '').trim()

// 404/403 → null (a missing thing is an answer); 429 retries with backoff
// (the BFS bursts trip ACC rate limits when several projects refresh at once);
// anything else non-OK throws so a transient ACC hiccup mid-crawl surfaces as
// an error instead of silently producing an empty (and then cached) model list.
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function dmGet<T>(url: string, token: string): Promise<T | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2
      await sleep(retryAfter * 1000 + 250)
      continue
    }
    if (res.status === 404 || res.status === 403) return null
    if (!res.ok) throw new Error(`ACC ${res.status} for ${url.slice(0, 120)}`)
    return res.json() as Promise<T>
  }
  throw new Error(`ACC 429 (rate limited) for ${url.slice(0, 120)}`)
}

const contents = (projId: string, folderId: string, token: string) =>
  dmGet<DmContents>(`${DM_BASE}/projects/${projId}/folders/${encodeURIComponent(folderId)}/contents?page[limit]=200`, token)
    .then(c => c ?? { data: [], included: [] })

// Does this folder name mark a coordination folder for the hub?
// EasyBIM: "Coordination" with an optional "N. " prefix and optional suffix —
// "Coordination", "7. Coordination (Design Collaboration)" — but NOT
// "ARC_STR Coordination" / "MEP Coordination" / "Site Coordination".
// ANA: the תאום מערכות discipline folder or its 0X.1.7 code.
function isCoordFolder(name: string, hubKey: string): boolean {
  if (hubKey === 'ana') {
    return /תאום\s*מערכות/.test(name) || /0?[0-9]\.1\.7(\b|[^.\d])/.test(name)
  }
  return /^(?:\d+\.\s*)?coordination\b/i.test(name)
}

function areaFromPath(path: string): 'WIP' | 'Shared' | null {
  if (/01_WIP|(^|\/)WIP(\/|$)/i.test(path)) return 'WIP'
  if (/02_Shared|(^|\/)Shared(\/|$)/i.test(path)) return 'Shared'
  return null
}

// Collect model files under a coordination folder (recursing into RVT-Models
// children etc.), skipping OLD/Consumed archives.
async function collectModels(
  projId: string, folderId: string, token: string,
  relPath: string, depth: number, out: (CoordinationModel & { itemId: string })[],
): Promise<void> {
  if (depth > 3) return
  const c = await contents(projId, folderId, token)
  const versionByItem = new Map<string, DmEntity>()
  for (const inc of c.included ?? []) {
    const itemId = inc.relationships?.item?.data?.id
    if (inc.type === 'versions' && itemId) versionByItem.set(itemId, inc)
  }
  for (const e of c.data ?? []) {
    const nm = folderName(e)
    if (e.type === 'folders') {
      if (SKIP_FOLDER_RE.test(nm)) continue
      await collectModels(projId, e.id, token, `${relPath}/${nm}`, depth + 1, out)
    } else if (e.type === 'items' && MODEL_EXT_RE.test(nm)) {
      const v = versionByItem.get(e.id)
      const urn = v?.relationships?.derivatives?.data?.id
      if (!urn) continue
      out.push({
        name: nm,
        urn,
        path: relPath,
        area: areaFromPath(relPath),
        versionNumber: Number(v?.attributes?.versionNumber ?? 0),
        publishedAt: v?.attributes?.createTime ?? null,
        publishedBy: v?.attributes?.createUserName ?? null,
        accModifiedAt: v?.attributes?.lastModifiedTime ?? null,
        accUrl: e.links?.webView?.href ?? null,
        itemId: e.id,
      })
    }
  }
}

async function isTranslated(urn: string, token: string): Promise<boolean> {
  const man = await dmGet<{ status?: string }>(`${MD_BASE}/${urn}/manifest`, token)
  return man?.status === 'success'
}

// When the tip version's translation is still running (ACC re-translates every
// Publish), fall back to the newest fully-translated version of the same item
// so the card keeps showing a model instead of vanishing mid-translation.
async function latestViewableVersion(
  projId: string, itemId: string, token: string,
): Promise<{ urn: string; versionNumber: number; publishedAt: string | null; publishedBy: string | null; accModifiedAt: string | null } | null> {
  const vs = await dmGet<{ data?: DmEntity[] }>(
    `${DM_BASE}/projects/${projId}/items/${encodeURIComponent(itemId)}/versions?page[limit]=8`, token,
  )
  for (const v of vs?.data ?? []) {   // newest first
    const urn = v.relationships?.derivatives?.data?.id
    if (!urn) continue
    if (await isTranslated(urn, token)) {
      return {
        urn,
        versionNumber: Number(v.attributes?.versionNumber ?? 0),
        publishedAt: v.attributes?.createTime ?? null,
        publishedBy: v.attributes?.createUserName ?? null,
        accModifiedAt: v.attributes?.lastModifiedTime ?? null,
      }
    }
  }
  return null
}

/**
 * The project's coordination models (translated only), newest first. BFS from
 * Project Files for coordination folders, then collect the models inside each.
 * THROWS on ACC errors — callers cache snapshots (see pageCache.ts) and a
 * transient failure must keep the last good one, not blank the card.
 */
export async function listCoordinationModels(
  accProjectId: string, hub: ApsHub,
): Promise<CoordinationModel[]> {
  const { access_token: token } = await getApsViewerToken(hub)
  const projId = 'b.' + accProjectId
  const hubId = 'b.' + hub.accountId

  const top = await dmGet<{ data?: DmEntity[] }>(
    `${PROJECT_BASE}/hubs/${hubId}/projects/${projId}/topFolders`, token,
  )
  if (!top) throw new Error(`topFolders unavailable for ${projId} on hub ${hub.key}`)
  const roots = (top.data ?? []).filter(f => folderName(f) === 'Project Files')
  const queue = (roots.length ? roots : (top.data ?? [])).map(f => ({ id: f.id, path: '' }))

  // BFS for coordination folders (bounded), collecting models inside each.
  // Models seen OUTSIDE coordination folders are recorded too — they feed the
  // filename fallback when the project has no coordination folder at all.
  const found: (CoordinationModel & { itemId: string })[] = []
  const elsewhere: (CoordinationModel & { itemId: string })[] = []
  let visited = 0
  while (queue.length && visited < 120) {
    const { id, path } = queue.shift()!
    visited += 1
    const c = await contents(projId, id, token)
    const versionByItem = new Map<string, DmEntity>()
    for (const inc of c.included ?? []) {
      const itemId = inc.relationships?.item?.data?.id
      if (inc.type === 'versions' && itemId) versionByItem.set(itemId, inc)
    }
    for (const e of c.data ?? []) {
      const nm = folderName(e)
      if (e.type === 'folders') {
        if (SKIP_FOLDER_RE.test(nm)) continue
        const p = path ? `${path}/${nm}` : nm
        if (isCoordFolder(nm, hub.key)) {
          await collectModels(projId, e.id, token, p, 0, found)
        } else if (p.split('/').length <= 4) {
          queue.push({ id: e.id, path: p })
        }
      } else if (e.type === 'items' && MODEL_EXT_RE.test(nm)) {
        const v = versionByItem.get(e.id)
        const urn = v?.relationships?.derivatives?.data?.id
        if (!urn) continue
        elsewhere.push({
          name: nm,
          urn,
          path,
          area: areaFromPath(path),
          versionNumber: Number(v?.attributes?.versionNumber ?? 0),
          publishedAt: v?.attributes?.createTime ?? null,
          publishedBy: v?.attributes?.createUserName ?? null,
          accModifiedAt: v?.attributes?.lastModifiedTime ?? null,
          accUrl: e.links?.webView?.href ?? null,
          itemId: e.id,
        })
      }
    }
  }

  // No coordination folder anywhere → fall back to models whose FILENAME
  // carries a coordination token (CO / COMB / MEP), wherever they live.
  const candidates = found.length > 0
    ? found
    : elsewhere.filter(m => COORD_NAME_RE.test(m.name))

  // Dedupe by URN; keep translated models. When a tip version is still
  // translating, substitute its newest fully-translated version.
  const byUrn = new Map(candidates.map(m => [m.urn, m]))
  const checked = await Promise.all(
    [...byUrn.values()].map(async m => {
      if (await isTranslated(m.urn, token)) return m
      const prev = await latestViewableVersion(projId, m.itemId, token)
      if (!prev) return null
      return { ...m, ...prev, processingVersion: m.versionNumber }
    }),
  )
  return checked
    .filter((m): m is CoordinationModel & { itemId: string } => m !== null)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 10)
    .map(({ itemId: _itemId, ...m }) => m)
}
