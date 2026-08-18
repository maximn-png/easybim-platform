// Per-creator issue stats stored on the project snapshot and shown next to the
// team avatars on the Projects dashboard ("8/12" = completed / all-except-closed).
// Computed wherever a full issue list is already in hand: the per-project issues
// API (piggyback) and the bulk pass in /api/sync/projects.

import { normalizeStatus } from '@/lib/reportGrouping'

export interface IssueCreatorStat {
  name:      string   // ACC creator display name
  completed: number   // issues with status "completed"
  active:    number   // issues with any status except "closed" (completed included)
}

// Accepts the minimal shape so both live AccIssue[] and imported Excel rows work.
export function computeIssueCreatorStats(
  issues: Array<{ status: string; createdBy?: string | null }>,
): IssueCreatorStat[] {
  const byName = new Map<string, { completed: number; active: number }>()
  for (const issue of issues) {
    const name = (issue.createdBy ?? '').trim()
    if (!name) continue
    const status = normalizeStatus(issue.status)
    if (status === 'closed') continue
    let entry = byName.get(name)
    if (!entry) { entry = { completed: 0, active: 0 }; byName.set(name, entry) }
    entry.active += 1
    if (status === 'completed') entry.completed += 1
  }
  return [...byName.entries()].map(([name, s]) => ({ name, ...s }))
}
