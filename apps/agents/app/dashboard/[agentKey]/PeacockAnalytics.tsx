'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  TrendingUp, Eye, Upload, Link2, Check, AlertCircle, X, BarChart3, Table2, ExternalLink, RefreshCw,
} from 'lucide-react'
import { CARD, PURPLE, PURPLE_2 } from './postMeta'

// Chart decisions, per the dataviz method:
// • Form: weekly impressions is change-over-time on discrete buckets → columns.
// • ONE series, one color — so no legend (the card title names what is plotted),
//   and engagements are NOT a second y-axis. They live in the tooltip and in the
//   summary line; a dual-axis chart would invent a correlation.
// • #7b5cff validated on a light surface (lightness band, chroma floor, ≥3:1
//   contrast all pass) via the palette validator.
// • Values are never tooltip-gated: the card has a table-view twin, and the
//   extreme + latest columns are directly labelled.
const SERIES = PURPLE
const GRID = '#eeecf6' // hairline, one step off the white surface
const INK_2 = '#8b909c'
const INK_1 = '#3a3f4d'
const PLOT_H = 140
const BAR_MAX_W = 24

export interface WeekPoint {
  weekStart: string
  label: string
  impressions: number
  engagements: number
  posts: number
}

export interface TopPost {
  id: string
  title: string
  postType: string | null
  publishDate: string | null
  linkedinUrl: string | null
  impressions: number
  engagements: number
  rate: number | null
}

export interface AnalyticsData {
  configured: boolean
  connected: boolean
  organizationName: string | null
  lastSyncAt: string | null
  hasData: boolean
  impressions30d: number
  engagements30d: number
  engagementRate30d: number | null
  followers: number | null
  followersGained30d: number | null
  postsWithMetrics: number
  publishedTotal: number
  series: WeekPoint[]
  topPosts: TopPost[]
}

/** Compact for display values (1,284 / 12.9K), never for axis ticks. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M')
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`.replace('.0K', 'K')
  return n.toLocaleString('en-US')
}

/** Round an axis maximum up to a clean 1/2/5×10ⁿ number. */
function niceMax(value: number): number {
  if (value <= 0) return 10
  const mag = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * mag) return step * mag
  }
  return 10 * mag
}

export function useAnalytics(agentKey: string) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/linkedin?weeks=8`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch { /* transient */ } finally { setLoading(false) }
  }, [agentKey])

  useEffect(() => { load() }, [load])
  return { data, loading, reload: load }
}

// ---------------------------------------------------------------------------
// the impressions card
// ---------------------------------------------------------------------------

export function ImpressionsCard({
  agentKey, data, onImported,
}: {
  agentKey: string
  data: AnalyticsData | null
  onImported: () => void
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [importOpen, setImportOpen] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  // Memoized so the derived values below don't recompute on every render.
  const series = useMemo(() => data?.series ?? [], [data])
  const max = useMemo(() => niceMax(Math.max(...series.map((s) => s.impressions), 0)), [series])
  const peakIdx = useMemo(() => {
    let best = -1
    series.forEach((s, i) => { if (s.impressions > 0 && (best === -1 || s.impressions > series[best].impressions)) best = i })
    return best
  }, [series])
  const lastIdx = useMemo(() => {
    for (let i = series.length - 1; i >= 0; i--) if (series[i].impressions > 0) return i
    return -1
  }, [series])

  const hasNumbers = series.some((s) => s.impressions > 0 || s.engagements > 0)

  return (
    <div style={{ ...CARD, padding: '22px 24px' }}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Impressions</h3>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: INK_2 }}>
            Last 8 weeks{data?.organizationName ? ` · ${data.organizationName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasNumbers && (
            <div className="flex items-center" style={{ background: '#f5f4fa', borderRadius: 9, padding: 2 }}>
              <IconToggle active={view === 'chart'} onClick={() => setView('chart')} title="Chart"><BarChart3 size={14} /></IconToggle>
              <IconToggle active={view === 'table'} onClick={() => setView('table')} title="Numbers"><Table2 size={14} /></IconToggle>
            </div>
          )}
          <button
            onClick={() => setImportOpen((v) => !v)}
            className="flex items-center gap-1.5"
            style={{ border: '1px solid #e7e3f7', background: '#fff', color: PURPLE, borderRadius: 9,
              padding: '6px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
          >
            <Upload size={13} /> Import
          </button>
        </div>
      </div>

      {importOpen && (
        <ImportPanel agentKey={agentKey} onClose={() => setImportOpen(false)} onImported={onImported} />
      )}

      {!hasNumbers ? (
        <EmptyAnalytics agentKey={agentKey} data={data} onImport={() => setImportOpen(true)} />
      ) : view === 'chart' ? (
        <>
          <div className="flex items-baseline gap-2.5 mb-3">
            {/* Proportional figures on the headline number (not tabular-nums). */}
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: INK_1 }}>
              {compact(data?.impressions30d ?? 0)}
            </span>
            <span style={{ fontSize: 12.5, color: INK_2, fontWeight: 600 }}>impressions · last 30 days</span>
            {data?.engagementRate30d != null && (
              <span style={{ fontSize: 12, color: INK_2, marginInlineStart: 'auto' }}>
                {data.engagementRate30d.toFixed(1)}% engagement rate
              </span>
            )}
          </div>

          <Chart
            series={series}
            max={max}
            peakIdx={peakIdx}
            lastIdx={lastIdx}
            hover={hover}
            setHover={setHover}
          />
        </>
      ) : (
        <SeriesTable series={series} />
      )}
    </div>
  )
}

function Chart({
  series, max, peakIdx, lastIdx, hover, setHover,
}: {
  series: WeekPoint[]
  max: number
  peakIdx: number
  lastIdx: number
  hover: number | null
  setHover: (i: number | null) => void
}) {
  const ticks = [max, max / 2, 0]
  const active = hover != null ? series[hover] : null
  const wrapRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div className="flex" style={{ gap: 10 }}>
        {/* y axis — tabular figures so ticks align vertically */}
        <div
          className="flex flex-col justify-between items-end"
          style={{ height: PLOT_H, fontSize: 10.5, color: INK_2, fontVariantNumeric: 'tabular-nums', flex: 'none', paddingBottom: 0 }}
        >
          {ticks.map((t) => (
            <span key={t} style={{ lineHeight: 1 }}>{Math.round(t).toLocaleString('en-US')}</span>
          ))}
        </div>

        {/* plot */}
        <div className="flex-1 min-w-0">
          <div style={{ position: 'relative', height: PLOT_H }}>
            {/* hairline gridlines, solid, recessive */}
            {ticks.map((t) => (
              <div
                key={t}
                style={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / max) * 100}%`, height: 1, background: GRID }}
              />
            ))}

            <div className="flex items-end" style={{ position: 'absolute', inset: 0 }}>
              {series.map((s, i) => {
                const h = max > 0 ? (s.impressions / max) * PLOT_H : 0
                const isHover = hover === i
                const label = i === peakIdx || (i === lastIdx && lastIdx !== peakIdx)
                return (
                  <div
                    key={s.weekStart}
                    // mouseleave on the old band fires before mouseenter on the
                    // new one, so clearing unconditionally is safe here.
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`Week of ${s.label}: ${s.impressions.toLocaleString('en-US')} impressions, ${s.engagements.toLocaleString('en-US')} engagements, ${s.posts} posts`}
                    // Hit target spans the whole band and full plot height, so it
                    // never demands landing on a thin bar.
                    className="flex-1 flex flex-col items-center justify-end"
                    style={{ height: '100%', cursor: 'default', outline: 'none', minWidth: 24, position: 'relative' }}
                  >
                    {label && s.impressions > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: INK_2, marginBottom: 3, whiteSpace: 'nowrap' }}>
                        {compact(s.impressions)}
                      </span>
                    )}
                    <div
                      style={{
                        width: `min(${BAR_MAX_W}px, 68%)`,
                        height: Math.max(s.impressions > 0 ? 2 : 0, h),
                        // 4px rounded data-end, square at the baseline
                        borderRadius: '4px 4px 0 0',
                        background: SERIES,
                        opacity: hover == null || isHover ? 1 : 0.45,
                        transition: 'opacity .15s',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* x axis band — inside the container, so nothing gets a nested scroll */}
          <div className="flex" style={{ marginTop: 7 }}>
            {series.map((s, i) => (
              <span
                key={s.weekStart}
                className="flex-1 text-center"
                style={{ fontSize: 10, color: hover === i ? INK_1 : INK_2, fontWeight: hover === i ? 700 : 500, minWidth: 24 }}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {active && (
        <div
          style={{ position: 'absolute', top: -6, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
        >
          <div style={{ background: '#fff', border: '1px solid #eeecf6', borderRadius: 10, padding: '7px 11px',
            boxShadow: '0 8px 22px rgba(60,40,140,.14)', fontSize: 11.5, color: INK_1, whiteSpace: 'nowrap' }}>
            <strong style={{ fontWeight: 800 }}>week of {active.label}</strong>
            {' · '}{active.impressions.toLocaleString('en-US')} impressions
            {' · '}{active.engagements.toLocaleString('en-US')} engagements
            {' · '}{active.posts} {active.posts === 1 ? 'post' : 'posts'}
          </div>
        </div>
      )}
    </div>
  )
}

/** The table-view twin — every plotted value readable without hovering. */
function SeriesTable({ series }: { series: WeekPoint[] }) {
  return (
    <div style={{ maxHeight: PLOT_H + 34, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ color: INK_2, fontSize: 11, textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 700, padding: '4px 0' }}>Week of</th>
            <th style={{ fontWeight: 700, padding: '4px 0' }}>Impressions</th>
            <th style={{ fontWeight: 700, padding: '4px 0' }}>Engagements</th>
            <th style={{ fontWeight: 700, padding: '4px 0' }}>Posts</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.weekStart} style={{ borderTop: `1px solid ${GRID}`, color: INK_1 }}>
              <td style={{ padding: '6px 0', fontWeight: 600 }}>{s.label}</td>
              <td style={{ padding: '6px 0', textAlign: 'right' }}>{s.impressions.toLocaleString('en-US')}</td>
              <td style={{ padding: '6px 0', textAlign: 'right' }}>{s.engagements.toLocaleString('en-US')}</td>
              <td style={{ padding: '6px 0', textAlign: 'right' }}>{s.posts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * No numbers yet — say plainly what the two routes are. The import works today;
 * the API needs a LinkedIn app that doesn't exist yet, so it is presented as
 * setup rather than a button that silently fails.
 */
function EmptyAnalytics({
  agentKey, data, onImport,
}: {
  agentKey: string
  data: AnalyticsData | null
  onImport: () => void
}) {
  return (
    <div style={{ border: `1px dashed ${GRID}`, borderRadius: 14, background: '#faf9ff', padding: '20px 18px' }}>
      <div className="flex items-center gap-2 mb-2">
        <Eye size={18} style={{ color: '#c8cdd8' }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK_1 }}>No LinkedIn numbers yet</span>
      </div>
      <p style={{ fontSize: 12.5, color: INK_2, margin: '0 0 14px', lineHeight: 1.6, maxWidth: 460 }}>
        Two ways to fill this in. Pasting your page export works right now; the live sync needs a LinkedIn
        developer app with Community Management access, which LinkedIn has to approve.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onImport}
          className="flex items-center gap-1.5 text-white"
          style={{ border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})` }}
        >
          <Upload size={14} /> Paste page export
        </button>
        {data?.configured ? (
          <a
            href={`/api/dashboard/${agentKey}/linkedin/connect`}
            className="flex items-center gap-1.5"
            style={{ border: '1px solid #e7e3f7', background: '#fff', color: PURPLE, borderRadius: 10,
              padding: '9px 14px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
          >
            <Link2 size={14} /> Connect LinkedIn
          </a>
        ) : (
          <span style={{ fontSize: 12, color: '#a9adb8', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Link2 size={14} /> Live sync: set LINKEDIN_CLIENT_ID / SECRET first (see README)
          </span>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: '#a9adb8', margin: '12px 0 0', lineHeight: 1.5 }}>
        You can also type a post&apos;s numbers straight into it — open any published post and fill the
        Performance row. {data?.publishedTotal ? `${data.publishedTotal} published posts are waiting.` : ''}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// import panel
// ---------------------------------------------------------------------------

interface ImportPreview {
  matched: Record<string, string>
  rows: number
  skipped: number
  from: string
  to: string
  totalImpressions: number
  written?: number
}

function ImportPanel({
  agentKey, onClose, onImported,
}: {
  agentKey: string
  onClose: () => void
  onImported: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  async function send(dryRun: boolean) {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/linkedin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dryRun }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Import failed'); setPreview(null); return }
      if (dryRun) { setPreview(d); setDone(null) }
      else { setDone(d.written ?? d.rows ?? 0); setPreview(d); onImported() }
    } catch {
      setError('Network error — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: '1px solid #eeecf6', borderRadius: 14, padding: 14, marginBottom: 16, background: '#fcfbff' }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK_1 }}>Import LinkedIn page analytics</span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#b0aebc' }}>
          <X size={15} />
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: INK_2, margin: '0 0 9px', lineHeight: 1.55 }}>
        LinkedIn page → Analytics → Export. Open the file and paste the rows here <strong>including their
        header</strong> (Date + Impressions / Engagements / Followers). CSV or a straight spreadsheet
        copy both work, in English or Hebrew.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setPreview(null); setDone(null); setError(null) }}
        placeholder={'Date,Impressions,Engagements\n01/07/2026,1204,64\n02/07/2026,2010,120'}
        rows={5}
        style={{ width: '100%', border: '1px solid #e7e3f7', borderRadius: 10, padding: 10, outline: 'none',
          fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', resize: 'vertical' }}
      />

      {error && (
        <div className="flex items-start gap-2" style={{ marginTop: 9, fontSize: 12, color: '#e2445c', lineHeight: 1.5 }}>
          <AlertCircle size={14} style={{ flex: 'none', marginTop: 1 }} /> {error}
        </div>
      )}

      {preview && !error && (
        <div style={{ marginTop: 10, fontSize: 12, color: INK_1, background: '#fff', border: `1px solid ${GRID}`,
          borderRadius: 10, padding: '9px 11px', lineHeight: 1.65 }}>
          {done != null ? (
            <span className="flex items-center gap-1.5" style={{ color: '#16a34a', fontWeight: 700 }}>
              <Check size={14} /> Imported {done} {done === 1 ? 'day' : 'days'} ({preview.from} → {preview.to}).
            </span>
          ) : (
            <>
              <div>
                <strong>{preview.rows}</strong> days ({preview.from} → {preview.to}),{' '}
                <strong>{preview.totalImpressions.toLocaleString('en-US')}</strong> impressions
                {preview.skipped > 0 && <span style={{ color: INK_2 }}> · {preview.skipped} rows skipped</span>}
              </div>
              <div style={{ color: INK_2, fontSize: 11.5 }}>
                columns read: {Object.entries(preview.matched).map(([k, v]) => `${v} → ${k}`).join(', ')}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
        <button
          onClick={() => send(true)}
          disabled={!text.trim() || busy}
          style={{ border: '1px solid #e7e3f7', background: '#fff', color: PURPLE, borderRadius: 9, padding: '7px 12px',
            fontSize: 12.5, fontWeight: 700, cursor: text.trim() && !busy ? 'pointer' : 'not-allowed', opacity: text.trim() && !busy ? 1 : 0.5 }}
        >
          Check columns
        </button>
        <button
          onClick={() => send(false)}
          disabled={!text.trim() || busy || done != null}
          className="text-white"
          style={{ border: 'none', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 700,
            background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})`,
            cursor: text.trim() && !busy && done == null ? 'pointer' : 'not-allowed',
            opacity: text.trim() && !busy && done == null ? 1 : 0.5 }}
        >
          {busy ? 'Working…' : done != null ? 'Imported' : 'Import'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// top posts + connection status
// ---------------------------------------------------------------------------

export function TopPostsCard({ data, onOpenPost }: { data: AnalyticsData | null; onOpenPost: (id: string) => void }) {
  const posts = data?.topPosts ?? []
  return (
    <div style={{ ...CARD, padding: '22px 24px 14px' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} style={{ color: PURPLE }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Top Posts</h3>
        </div>
        <span style={{ fontSize: 11.5, color: '#a9adb8' }}>by impressions</span>
      </div>

      {posts.length === 0 ? (
        <p style={{ fontSize: 12.5, color: '#a9adb8', padding: '14px 0 8px', lineHeight: 1.6, margin: 0 }}>
          No post numbers yet. Open a published post and fill its Performance row, or import the page export
          above — the best performers will rank here.
        </p>
      ) : (
        posts.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onOpenPost(p.id)}
            className="flex items-center gap-3 w-full text-left"
            style={{ padding: '11px 0', borderTop: `1px solid ${GRID}`, background: 'transparent', border: 'none',
              borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: GRID, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span className="flex items-center justify-center font-extrabold" style={{ width: 26, height: 26, borderRadius: 8,
              background: '#f0ecff', color: PURPLE, fontSize: 12, flex: 'none' }}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div dir="auto" style={{ fontSize: 13.5, fontWeight: 600, color: INK_1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
              <div style={{ fontSize: 11.5, color: '#a9adb8', marginTop: 2 }}>
                {p.postType ?? '—'}
                {p.rate != null && ` · ${p.rate.toFixed(1)}% engagement`}
              </div>
            </div>
            <div className="text-right" style={{ flex: 'none' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: INK_1 }}>{compact(p.impressions)}</div>
              <div style={{ fontSize: 11, color: '#a9adb8' }}>{compact(p.engagements)} eng.</div>
            </div>
          </button>
        ))
      )}
    </div>
  )
}

/** A one-line honest statement of where the LinkedIn connection stands. */
export function LinkedInStatusRow({ agentKey, data, onChanged }: { agentKey: string; data: AnalyticsData | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  if (!data) return null

  async function disconnect() {
    if (busy || !confirm('Disconnect LinkedIn? Stored history is kept.')) return
    setBusy(true)
    try {
      await fetch(`/api/dashboard/${agentKey}/linkedin`, { method: 'DELETE' })
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11.5, color: '#a9adb8', marginTop: 12, paddingInline: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: data.connected ? '#00c875' : '#dcdae8' }} />
      {data.connected ? (
        <>
          <span>
            LinkedIn connected{data.organizationName ? ` · ${data.organizationName}` : ''}
            {data.lastSyncAt ? ` · synced ${new Date(data.lastSyncAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ' · not synced yet'}
          </span>
          <button onClick={disconnect} disabled={busy}
            style={{ border: 'none', background: 'transparent', color: '#e2445c', cursor: 'pointer', fontWeight: 700, fontSize: 11.5, fontFamily: 'inherit' }}>
            disconnect
          </button>
        </>
      ) : data.configured ? (
        <>
          <span>LinkedIn not connected — numbers come from imports and manual entry.</span>
          <a href={`/api/dashboard/${agentKey}/linkedin/connect`} style={{ color: PURPLE, fontWeight: 700, textDecoration: 'none' }}>
            connect →
          </a>
        </>
      ) : (
        <span>
          Live LinkedIn sync isn&apos;t set up yet (no developer app). Numbers come from the page export and
          manual entry — see &ldquo;Connecting LinkedIn&rdquo; in the README.
        </span>
      )}
    </div>
  )
}

function IconToggle({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} aria-pressed={active}
      style={{ border: 'none', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
        background: active ? '#fff' : 'transparent', color: active ? PURPLE : '#9aa0ac',
        boxShadow: active ? '0 1px 4px rgba(90,70,180,.12)' : 'none' }}>
      {children}
    </button>
  )
}

export { RefreshCw, ExternalLink }
