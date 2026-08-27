import { headers } from 'next/headers'
import { HEALTH_TARGETS } from '@/lib/healthTargets'
import RefreshButton from './RefreshButton'
import { fmtDateTime } from '@/lib/dates'

// Integrations health board — fans out to every app's public /api/health and
// renders one card per app with per-check status.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Check = { ok: boolean; detail: string }
interface AppHealth {
  app: string
  state: 'green' | 'red' | 'no-endpoint' | 'not-configured'
  detail?: string
  checks: Array<{ name: string } & Check>
}

async function probe(app: string, baseUrl: string): Promise<AppHealth> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) return { app, state: 'no-endpoint', checks: [] }
    const body = await res.json().catch(() => null) as
      { ok?: boolean; checks?: Record<string, Check> } | null
    const checks = body?.checks
      ? Object.entries(body.checks).map(([name, c]) => ({ name, ...c }))
      : []
    if (res.ok && body?.ok) return { app, state: 'green', checks }
    return { app, state: 'red', detail: body ? undefined : `HTTP ${res.status}`, checks }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const detail = /abort|timeout/i.test(msg)
      ? 'timed out (8s) — app may be cold-starting; hit Refresh'
      : /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg)
        ? `unreachable at ${baseUrl} — app not running (local dev) or wrong URL`
        : msg
    return { app, state: 'red', detail, checks: [] }
  }
}

const STATE_META: Record<AppHealth['state'], { label: string; dot: string; text: string }> = {
  green:            { label: 'Healthy',            dot: '#059669', text: '#059669' },
  red:              { label: 'Failing',            dot: '#dc2626', text: '#dc2626' },
  'no-endpoint':    { label: 'No health endpoint', dot: '#9ca3af', text: '#6b7280' },
  'not-configured': { label: 'Not configured',     dot: '#9ca3af', text: '#6b7280' },
}

export default async function IntegrationsPage() {
  // Portal probes itself via its own origin — no NEXT_PUBLIC_PORTAL_URL needed.
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('host') ?? 'localhost:3000'
  const selfUrl = `${proto}://${host}`

  const targets: Array<{ app: string; url: string | undefined }> = [
    { app: 'portal', url: selfUrl },
    ...HEALTH_TARGETS,
  ]

  const results = await Promise.all(
    targets.map((t): Promise<AppHealth> =>
      t.url
        ? probe(t.app, t.url)
        : Promise.resolve({ app: t.app, state: 'not-configured' as const, checks: [] })),
  )

  const failing = results.filter((r) => r.state === 'red').length
  const checkedAt = fmtDateTime(new Date())

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-2xl font-black" style={{ color: '#1e248c' }}>Integrations</h1>
        <RefreshButton />
      </div>
      <p className="text-sm mb-4" style={{ color: '#6b7280' }}>
        Live probes of each app&apos;s connections — checked at {checkedAt}.
      </p>

      <div
        className="mb-4 px-4 py-3 rounded-xl border text-sm font-semibold"
        style={failing
          ? { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }
          : { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}
      >
        {failing ? `${failing} app${failing > 1 ? 's' : ''} failing health checks` : 'All probed apps are healthy'}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.map((r) => {
          const meta = STATE_META[r.state]
          return (
            <div key={r.app} className="bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-sm capitalize" style={{ color: '#111827' }}>{r.app}</h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: meta.text }}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: meta.dot }} />
                  {meta.label}
                </span>
              </div>
              {r.detail && <p className="text-[11px] mb-1" style={{ color: '#b91c1c' }}>{r.detail}</p>}
              {r.checks.length > 0 ? (
                <ul className="space-y-1">
                  {r.checks.map((c) => (
                    <li key={c.name} className="flex items-start gap-1.5 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full inline-block mt-1 shrink-0" style={{ background: c.ok ? '#059669' : '#dc2626' }} />
                      <span className="font-medium text-gray-700">{c.name}:</span>
                      <span className="text-gray-500 break-all">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : r.state !== 'red' ? (
                <p className="text-[11px]" style={{ color: '#9ca3af' }}>
                  {r.state === 'not-configured' ? 'App URL env var not set.' : r.state === 'no-endpoint' ? 'App has no /api/health route yet.' : ''}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
