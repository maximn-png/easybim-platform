// Aggregated Monday "updates" feed for a project — shared by the updates route
// (the feed itself) and the updates-summary route (the AI status paragraph), so
// both read/write the same swrCache snapshot (key `updates:{projectId}`).
import {
  fetchItemUpdates, fetchBoardUpdates, fetchMilestoneUpdatesForProject,
  fetchBoardDocUpdates, type MondayUpdate,
} from '@/lib/services/mondayService'

export const MAX_UPDATES = 100
export const UPDATES_CACHE_TTL_MS = 5 * 60_000
export const updatesCacheKey = (projectId: string) => `updates:${projectId}`

export interface UpdatesPayload {
  updates: MondayUpdate[]
  partialErrors?: string[]
}

// The live aggregation — each source independent, one failure must not block
// the rest. Runs on first view, on ?refresh=1, and in background revalidation.
export async function aggregateUpdates(
  dedicatedBoardId: string | null,
  masterItemId: string | undefined,
): Promise<UpdatesPayload> {
  const results = await Promise.allSettled([
    dedicatedBoardId
      ? fetchBoardUpdates(dedicatedBoardId, { kind: 'project-board', label: 'Project board' })
      : Promise.resolve([] as MondayUpdate[]),
    masterItemId
      ? fetchMilestoneUpdatesForProject(masterItemId)
      : Promise.resolve([] as MondayUpdate[]),
    masterItemId
      ? fetchItemUpdates(masterItemId, { kind: 'master', label: 'Master (MA-004)' })
      : Promise.resolve([] as MondayUpdate[]),
    dedicatedBoardId
      ? fetchBoardDocUpdates(dedicatedBoardId)
      : Promise.resolve([] as MondayUpdate[]),
  ])

  const errors: string[] = []
  const merged: MondayUpdate[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value)
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
  }

  // De-dupe by update id, sort newest first, cap the total.
  const byId = new Map<string, MondayUpdate>()
  for (const u of merged) if (!byId.has(u.id)) byId.set(u.id, u)
  const updates = Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_UPDATES)

  return { updates, ...(errors.length ? { partialErrors: errors } : {}) }
}
