import { getCrossDbConnection } from '@easybim/db'
import SyncRuns, { type SyncRunRow } from './SyncRuns'
import { fmtDateTime } from '@/lib/dates'

// Sync Health — recent EPM project-sync runs, read cross-DB from
// easybim-epm.epm_sync_runs (written by EPM's /api/sync/projects).
export const dynamic = 'force-dynamic'

const fmtMin = (ms: number) => ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${Math.round(ms / 1000)}s`

export default async function SyncHealthPage() {
  let runs: SyncRunRow[] = []
  let loadError: string | null = null
  try {
    const conn = await getCrossDbConnection('easybim-epm')
    const docs = await conn
      .collection('epm_sync_runs')
      .find({}, { sort: { startedAt: -1 }, limit: 30 })
      .toArray()
    runs = docs.map((d) => ({
      id: String(d._id),
      startedAt: new Date(d.startedAt as Date).getTime(),
      durationMs: (d.durationMs as number) ?? 0,
      trigger: (d.trigger as string) === 'cron' ? 'cron' : 'manual',
      triggeredBy: (d.triggeredBy as string) ?? null,
      ok: d.ok === true,
      synced: (d.synced as number) ?? 0,
      issueStatsUpdated: (d.issueStatsUpdated as number) ?? 0,
      errors: Array.isArray(d.errors) ? (d.errors as string[]) : [],
      fatal: (d.fatal as string) ?? null,
    }))
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  const last = runs[0]
  const lastSuccess = runs.find((r) => r.ok)
  const recent = runs.slice(0, 10)
  const avgDuration = recent.length
    ? recent.reduce((s, r) => s + r.durationMs, 0) / recent.length
    : null

  const tiles = [
    {
      label: 'Last run',
      value: last ? (last.fatal ? 'Failed' : last.ok ? 'OK' : `${last.errors.length} errors`) : '—',
      hint: last ? fmtDateTime(last.startedAt) : 'no runs recorded yet',
      color: last ? (last.fatal ? '#dc2626' : last.ok ? '#059669' : '#d97706') : '#6b7280',
    },
    {
      label: 'Last clean run',
      value: lastSuccess ? fmtDateTime(lastSuccess.startedAt) : '—',
      hint: 'zero errors',
      color: '#1e248c',
    },
    {
      label: 'Avg duration',
      value: avgDuration != null ? fmtMin(avgDuration) : '—',
      hint: `last ${recent.length} runs`,
      color: '#1e248c',
    },
    { label: 'Schedule', value: 'Hourly', hint: 'Vercel cron on EPM + manual Sync Now', color: '#1e248c' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-black mb-1" style={{ color: '#1e248c' }}>Sync Health</h1>
      <p className="text-sm mb-5" style={{ color: '#6b7280' }}>
        EPM project sync — Monday, Drive, ACC and hours. Runs are recorded by the sync itself.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl px-4 py-3 shadow-sm">
            <div className="text-[11px] font-medium" style={{ color: '#6b7280' }}>{t.label}</div>
            <div className="text-lg font-bold" style={{ color: t.color }}>{t.value}</div>
            <div className="text-[10px]" style={{ color: '#9ca3af' }}>{t.hint}</div>
          </div>
        ))}
      </div>

      {loadError ? (
        <div className="bg-white/65 border border-white/90 rounded-2xl p-8 text-center text-sm" style={{ color: '#b91c1c' }}>
          Could not read sync runs: {loadError}
        </div>
      ) : (
        <SyncRuns runs={runs} />
      )}
    </div>
  )
}
