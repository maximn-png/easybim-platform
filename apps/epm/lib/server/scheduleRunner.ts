import 'server-only'
import { runSchedule, type RunResult, type ScheduleConfig } from './reportRunner'
import { nextRunFor, parseFrequency } from './scheduleDto'

// Wraps runSchedule with the bookkeeping every caller needs: outcome on the
// document, a trimmed run history, and (for cron runs) re-arming nextRunAt.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScheduleDoc = any

const HISTORY_KEEP = 10

export async function recordRun(
  doc: ScheduleDoc,
  opts: { actingUserId?: string; rearm?: boolean } = {},
): Promise<RunResult> {
  const config: ScheduleConfig = {
    _id:          String(doc._id),
    projectId:    String(doc.projectId),
    name:         doc.name,
    templateId:   doc.templateId,
    variantId:    doc.variantId ?? null,
    groupBy:      doc.groupBy,
    filters: {
      assignees:   doc.filters?.assignees   ?? [],
      issueTypes:  doc.filters?.issueTypes  ?? [],
      disciplines: doc.filters?.disciplines ?? [],
      statuses:    doc.filters?.statuses    ?? [],
      extra:       (doc.filters?.extra ?? []).map((e: { key: string; values: string[] }) =>
                     ({ key: e.key, values: e.values ?? [] })),
    },
    bodyText:     doc.bodyText ?? '',
    modelLink:    doc.modelLink,
    recipients:   doc.recipients ?? [],
    deliveryMode: doc.deliveryMode === 'draft' ? 'draft' : 'send',
    // A manual "run now" acts as the person who clicked it — their tokens are
    // live in this session. Cron runs fall back to the schedule's owner.
    ownerUserId:  opts.actingUserId || doc.ownerUserId,
  }

  let result: RunResult
  try {
    result = await runSchedule(config)
  } catch (err) {
    result = { status: 'failed', error: err instanceof Error ? err.message : String(err) }
  }

  doc.lastRunAt  = new Date()
  doc.lastStatus = result.status
  doc.lastError  = result.error
  doc.runCount   = (doc.runCount ?? 0) + 1
  doc.history    = [
    ...(doc.history ?? []),
    {
      at: doc.lastRunAt,
      status: result.status,
      error: result.error,
      reportId: result.reportId,
      issueCount: result.issueCount,
      recipients: result.recipients,
    },
  ].slice(-HISTORY_KEEP)

  // Only a scheduled run moves the cadence forward; a manual test must not
  // silently skip the next real send.
  if (opts.rearm) {
    doc.nextRunAt = nextRunFor(parseFrequency(doc.frequency), doc.timezone)
  }

  await doc.save()
  return result
}
