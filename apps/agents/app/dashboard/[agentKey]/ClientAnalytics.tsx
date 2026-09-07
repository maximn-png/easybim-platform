'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Info, RefreshCw } from 'lucide-react'
import { ACCENT, CARD } from './postMeta'
import {
  ClientFlag, ClientRowDTO, ClientsDTO, FLAG_LABEL, FLAG_TONE_COLOR, OUTCOME_COLOR, PARTY_OPTIONS, PartyKey,
  fmtDate, fmtMonths, shekel,
} from './squirrelMeta'

// Analytics by Client — is each quoting relationship healthy, and which ones need
// a phone call.
//
// The row is deliberately not just a win rate. A client at 60% who last asked for
// a quote fourteen months ago is a worse problem than one at 30% who asks every
// month, and only the "last asked" and "declining run" columns show that. The
// attention list at the top is the same rows, sorted by how much they need doing
// something about.

type Range = { label: string; months?: number }
const RANGES: Range[] = [
  { label: 'All time' },
  { label: 'Last 24 mo', months: 24 },
  { label: 'Last 12 mo', months: 12 },
]

type SortKey = 'quotes' | 'winRate' | 'valueWon' | 'lastSent'

export default function ClientAnalytics({ agentKey, onBack }: { agentKey: string; onBack: () => void }) {
  const [data, setData] = useState<ClientsDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [party, setParty] = useState<PartyKey>('developer')
  const [range, setRange] = useState<Range>(RANGES[0])
  const [sort, setSort] = useState<SortKey>('quotes')
  const [openRow, setOpenRow] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ party })
      if (range.months) qs.set('sinceMonths', String(range.months))
      const res = await fetch(`/api/dashboard/${agentKey}/clients?${qs}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'failed to load')
      setData(json)
      setOpenRow(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [agentKey, party, range])

  useEffect(() => { load() }, [load])

  const rows = data ? sortRows(data.rows, sort) : []
  const t = data?.totals

  return (
    <div style={{ minHeight: '100vh', color: '#1f2430', background: 'linear-gradient(135deg,#f0f3ff 0%,#e7eefe 100%)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px 60px' }}>
        <header className="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold mb-2 cursor-pointer"
              style={{ background: 'transparent', border: 'none', color: 'rgba(30,36,140,.7)', fontFamily: 'inherit', padding: 0 }}>
              <ArrowLeft size={13} /> Squirrel
            </button>
            <h1 className="text-3xl font-bold text-[#1e248c]">Analytics by Client</h1>
            <p className="text-gray-500 text-sm mt-1">
              How many quotes each party asks for, how many we win, and who has gone quiet.
            </p>
          </div>
          <button onClick={load} disabled={loading} className={PILL}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} /> Refresh
          </button>
        </header>

        {/* Filters, one row above the data — party first, it changes everything below. */}
        <div className="flex items-center gap-2 flex-wrap mb-5" style={{ ...CARD, padding: '10px 16px' }}>
          <span className="text-[11.5px] font-semibold text-gray-400 uppercase tracking-wide" style={{ flex: 'none' }}>Group by</span>
          {PARTY_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setParty(o.key)}
              title={o.hebrew}
              className="cursor-pointer font-medium"
              style={{
                fontSize: 11.5, padding: '4px 10px', borderRadius: 999, fontFamily: 'inherit',
                border: `1px solid ${party === o.key ? '#b9c6ea' : '#e3e8f4'}`,
                background: party === o.key ? '#eef3fe' : '#fff',
                color: party === o.key ? ACCENT : '#9ca3af',
              }}
            >
              {o.label}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: '#e7ebf5', flex: 'none', margin: '0 4px' }} />
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className="cursor-pointer font-medium"
              style={{
                fontSize: 11.5, padding: '4px 10px', borderRadius: 999, fontFamily: 'inherit',
                border: `1px solid ${range.label === r.label ? '#b9c6ea' : '#e3e8f4'}`,
                background: range.label === r.label ? '#eef3fe' : '#fff',
                color: range.label === r.label ? ACCENT : '#9ca3af',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ ...CARD, padding: '14px 18px', marginBottom: 18, borderColor: '#f4c7c7', background: '#fff7f7' }}>
            <span className="text-sm" style={{ color: '#b42318' }}>Couldn’t load: {error}</span>
          </div>
        )}

        {data && t && (
          <>
            <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
              <Tile label={data.partyLabel} value={t.parties} note={`${t.quotes} quotes · ${data.partyHebrew}`} />
              <Tile
                label="Win rate"
                value={t.winRate == null ? '—' : `${Math.round(t.winRate * 100)}%`}
                note={`${t.won} won · ${t.lost} declined`}
              />
              <Tile label="Value won" value={shekel(t.valueWon)} note={`${shekel(t.valueLost)} declined`} />
              <Tile
                label="Need attention"
                value={data.attention.length}
                valueColor={data.attention.length ? FLAG_TONE_COLOR.warn : undefined}
                note="declining runs or gone quiet"
              />
            </div>

            {data.attention.length > 0 && (
              <AttentionList rows={data.attention.slice(0, 6)} onOpen={(p) => setOpenRow(p)} />
            )}

            <div style={{ ...CARD, padding: '18px 22px 8px' }}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">
                  Every {data.partyLabel.toLowerCase()} <span className="text-gray-400 font-normal" dir="rtl">({data.partyHebrew})</span>
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400">Sort</span>
                  {(['quotes', 'winRate', 'valueWon', 'lastSent'] as SortKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setSort(k)}
                      className="cursor-pointer font-medium"
                      style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 999, fontFamily: 'inherit',
                        border: `1px solid ${sort === k ? '#b9c6ea' : '#e3e8f4'}`,
                        background: sort === k ? '#eef3fe' : '#fff',
                        color: sort === k ? ACCENT : '#9ca3af',
                      }}
                    >
                      {SORT_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>

              <HeaderRow />
              {rows.map((r) => (
                <ClientRow key={r.party} row={r} open={openRow === r.party} onToggle={() => setOpenRow(openRow === r.party ? null : r.party)} />
              ))}
              {rows.length === 0 && !loading && (
                <p className="text-[13px] text-gray-400 py-6 text-center">No quotes in this range.</p>
              )}
            </div>

            {data.unassigned > 0 && (
              <div style={{ ...CARD, padding: '14px 20px', marginTop: 16, background: '#fbfcff' }}>
                <div className="flex items-start gap-2 text-[12px] text-gray-500 leading-relaxed">
                  <Info size={14} style={{ color: '#9ca3af', flex: 'none', marginTop: 2 }} />
                  <span>
                    <strong className="text-gray-600">{data.unassigned} quotes</strong> have no{' '}
                    <span dir="rtl">{data.partyHebrew}</span> filled in on Monday, so they aren’t in any row above.
                    Another grouping may cover them — try <em>Work orderer</em> or <em>Project management</em>.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const PILL =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50'

const SORT_LABEL: Record<SortKey, string> = {
  quotes: 'Quotes',
  winRate: 'Win rate',
  valueWon: 'Value won',
  lastSent: 'Last asked',
}

function sortRows(rows: ClientRowDTO[], key: SortKey): ClientRowDTO[] {
  const copy = [...rows]
  switch (key) {
    case 'winRate':
      // Undecided parties have no rate to rank on; keep them last rather than at 0%.
      return copy.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.quotes - a.quotes)
    case 'valueWon':
      return copy.sort((a, b) => b.valueWon - a.valueWon)
    case 'lastSent':
      return copy.sort((a, b) => (b.lastSent ?? '').localeCompare(a.lastSent ?? ''))
    default:
      return copy.sort((a, b) => b.quotes - a.quotes)
  }
}

function Tile({ label, value, note, valueColor }: { label: string; value: string | number; note: string; valueColor?: string }) {
  return (
    <div style={{ ...CARD, padding: '14px 18px' }}>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ letterSpacing: '-.02em', color: valueColor ?? '#1e248c' }}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-1" dir="auto">{note}</div>
    </div>
  )
}

function AttentionList({ rows, onOpen }: { rows: ClientRowDTO[]; onOpen: (party: string) => void }) {
  return (
    <div style={{ ...CARD, padding: '18px 22px 12px', marginBottom: 18 }}>
      <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">Worth a call</h3>
      <p className="text-[12px] text-gray-400 mt-0.5 mb-2">
        Relationships whose recent pattern changed — a run of declines, or a long silence.
      </p>
      {rows.map((r) => (
        <button
          key={r.party}
          onClick={() => onOpen(r.party)}
          className="w-full flex items-center gap-3 text-left cursor-pointer"
          style={{ padding: '10px 0', background: 'transparent', border: 'none', borderTop: '1px solid #eef1f8', fontFamily: 'inherit' }}
        >
          <span dir="auto" className="text-[13px] font-medium text-[#2b2f3a]" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.party}
          </span>
          <span className="flex items-center gap-1.5" style={{ flex: 'none' }}>
            {r.flags.filter((f) => FLAG_LABEL[f].tone !== 'good').map((f) => <Flag key={f} flag={f} />)}
          </span>
          <span className="text-[11.5px] text-gray-500" style={{ width: 210, flex: 'none', textAlign: 'right' }}>
            {r.quotes} quotes · {r.won}W/{r.lost}L · last asked {fmtDate(r.lastSent)}
          </span>
        </button>
      ))}
    </div>
  )
}

function Flag({ flag }: { flag: ClientFlag }) {
  const m = FLAG_LABEL[flag]
  const c = FLAG_TONE_COLOR[m.tone]
  return (
    <span title={m.hint} className="font-semibold" style={{ fontSize: 10.5, color: c, background: `${c}1a`, padding: '2px 7px', borderRadius: 999 }}>
      {m.label}
    </span>
  )
}

function HeaderRow() {
  return (
    <div className="flex items-center gap-3 text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide" style={{ padding: '8px 0 6px' }}>
      <span style={{ width: 15, flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>Name</span>
      <span style={{ width: 130, flex: 'none' }}>Outcomes</span>
      <span style={{ width: 62, flex: 'none', textAlign: 'right' }}>Win</span>
      <span style={{ width: 78, flex: 'none', textAlign: 'right' }}>Won ₪</span>
      <span style={{ width: 90, flex: 'none', textAlign: 'right' }}>Last asked</span>
      <span style={{ width: 150, flex: 'none', textAlign: 'right' }}>Signal</span>
    </div>
  )
}

/**
 * One party. The outcomes bar is a stacked won/lost/open/hold count — status
 * colours, and every segment carries its number in the legend row below when
 * expanded, plus a tooltip, so identity never rests on colour alone.
 */
function ClientRow({ row: r, open, onToggle }: { row: ClientRowDTO; open: boolean; onToggle: () => void }) {
  const total = Math.max(r.quotes, 1)
  const segs: { key: 'won' | 'lost' | 'open' | 'onHold'; n: number; label: string }[] = [
    { key: 'won', n: r.won, label: 'Approved' },
    { key: 'lost', n: r.lost, label: 'Declined' },
    { key: 'open', n: r.open, label: 'Open' },
    { key: 'onHold', n: r.onHold, label: 'On hold' },
  ]

  return (
    <div style={{ borderTop: '1px solid #eef1f8' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left cursor-pointer"
        style={{ padding: '10px 0', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
      >
        {open ? <ChevronDown size={14} style={{ color: ACCENT, flex: 'none' }} /> : <ChevronRight size={14} style={{ color: '#c3c9d6', flex: 'none' }} />}
        <span dir="auto" className="text-[13px] text-[#2b2f3a]" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.party}
        </span>

        <span className="flex" style={{ width: 130, flex: 'none', height: 9, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
          {segs.map((s) =>
            s.n ? (
              <span key={s.key} title={`${s.n} ${s.label}`} style={{ width: `${(s.n / total) * 100}%`, background: OUTCOME_COLOR[s.key] }} />
            ) : null
          )}
        </span>

        <span className="text-[12px] font-semibold" style={{ width: 62, flex: 'none', textAlign: 'right', color: r.winRate == null ? '#c3c9d6' : r.winRate >= 0.5 ? OUTCOME_COLOR.won : r.winRate > 0 ? '#5b6270' : OUTCOME_COLOR.lost }}>
          {r.winRate == null ? '—' : `${Math.round(r.winRate * 100)}%`}
        </span>
        <span className="text-[12px] text-gray-600" style={{ width: 78, flex: 'none', textAlign: 'right' }}>{shekel(r.valueWon)}</span>
        <span className="text-[11.5px]" style={{ width: 90, flex: 'none', textAlign: 'right', color: (r.monthsSinceLastSent ?? 0) >= 5 ? FLAG_TONE_COLOR.warn : '#9ca3af' }}>
          {r.monthsSinceLastSent == null ? '—' : `${fmtMonths(r.monthsSinceLastSent)} ago`}
        </span>
        <span className="flex items-center justify-end gap-1.5" style={{ width: 150, flex: 'none' }}>
          {r.flags.map((f) => <Flag key={f} flag={f} />)}
        </span>
      </button>

      {open && (
        <div style={{ padding: '2px 0 16px 28px' }}>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] mb-3">
            {segs.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span style={{ width: 9, height: 9, borderRadius: 3, background: OUTCOME_COLOR[s.key], flex: 'none' }} />
                <span className="text-gray-500">{s.label}</span>
                <span className="font-bold text-[#1e248c]">{s.n}</span>
              </span>
            ))}
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">Avg quote <strong className="text-[#2b2f3a]">{shekel(r.avgPrice)}</strong></span>
            <span className="text-gray-500">Declined value <strong className="text-[#2b2f3a]">{shekel(r.valueLost)}</strong></span>
            {r.medianResponseDays != null && (
              <span className="text-gray-500">Answers in <strong className="text-[#2b2f3a]">~{r.medianResponseDays} days</strong></span>
            )}
            <span className="text-gray-500">First quote <strong className="text-[#2b2f3a]">{fmtDate(r.firstSent)}</strong></span>
          </div>

          {r.flags.length > 0 && (
            <div className="flex flex-col gap-1 mb-3">
              {r.flags.map((f) => (
                <div key={f} className="flex items-start gap-1.5 text-[11.5px]">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: FLAG_TONE_COLOR[FLAG_LABEL[f].tone], flex: 'none', marginTop: 5 }} />
                  <span className="text-gray-500">
                    <strong style={{ color: FLAG_TONE_COLOR[FLAG_LABEL[f].tone] }}>{FLAG_LABEL[f].label}.</strong> {FLAG_LABEL[f].hint}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Quotes, newest first</div>
          {r.quotesList.slice(0, 14).map((q) => (
            <div key={q.itemId} className="flex items-center gap-3" style={{ padding: '6px 0', borderTop: '1px solid #f4f6fb' }}>
              <span className="text-[11px] text-gray-400 font-mono" style={{ width: 44, flex: 'none' }}>{q.quoteNumber ?? '—'}</span>
              <span dir="auto" className="text-[12px] text-[#2b2f3a]" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.name}
              </span>
              <span className="text-[11px] text-gray-400" style={{ width: 52, flex: 'none' }}>{q.projectType ?? '—'}</span>
              <span className="text-[11.5px] text-gray-600" style={{ width: 70, flex: 'none', textAlign: 'right' }}>{shekel(q.price)}</span>
              <span className="text-[11px] text-gray-400" style={{ width: 78, flex: 'none', textAlign: 'right' }}>{fmtDate(q.sentDate)}</span>
              <span
                className="font-semibold"
                style={{ width: 84, flex: 'none', textAlign: 'center', fontSize: 10.5, color: OUTCOME_COLOR[q.outcome], background: `${OUTCOME_COLOR[q.outcome]}1a`, padding: '2px 7px', borderRadius: 999 }}
              >
                {q.status ?? '—'}
              </span>
              <span style={{ width: 16, flex: 'none' }}>
                {q.docUrl && (
                  <a href={q.docUrl} target="_blank" rel="noreferrer" title="Quote document" style={{ color: ACCENT }}>
                    <ExternalLink size={11} />
                  </a>
                )}
              </span>
            </div>
          ))}
          {r.quotesList.length > 14 && (
            <p className="text-[11px] text-gray-400 mt-1.5 mb-0">…and {r.quotesList.length - 14} more — ask Squirrel for the full list.</p>
          )}
        </div>
      )}
    </div>
  )
}
