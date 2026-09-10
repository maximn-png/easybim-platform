'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Info, RefreshCw, SlidersHorizontal, X,
} from 'lucide-react'
import { ACCENT, ACCENT_BG, CARD } from './postMeta'
import {
  CompletedDTO, CompletedProjectDTO, Department, DEPT_COLOR, DeptRollupDTO, TypeGroupDTO, Verdict,
  VERDICT_COLOR, VERDICT_LABEL, fmtMonths, hrs, pctText, shekel,
} from './squirrelMeta'

// Completed Projects — how the finished work actually went, by סוג פרויקט.
//
// Two readers, one screen. The office manager wants "did Type C treat us well?"
// — that is the type table. The team leader planning the next Type C wants "how
// many hours did תאום מערכות really need on one of these?" — that is the
// department split inside each type, and the per-project rows underneath it.
//
// Every bar is a bank-vs-spent meter: the track is the hours we were PAID for
// (₪ ÷ 300), the fill is the hours we SPENT, and the tick is break-even
// (₪ ÷ 225). Past the tick we lost money on the job — the office's own כדאיות
// rule, so the card and MA-004 speak the same language.

const DEPT_LABELS: Record<Exclude<Department, 'none'>, string> = {
  modelMgmt: 'Model MGMT',
  superposition: 'Superposition',
  modelling: 'Modelling',
}

/** Where break-even sits on the meter: bank(@300) × 300/225. */
const CEILING_FACTOR = 300 / 225

export default function CompletedProjects({ agentKey, onBack }: { agentKey: string; onBack: () => void }) {
  const [data, setData] = useState<CompletedDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openType, setOpenType] = useState<string | null>(null)
  const [openProject, setOpenProject] = useState<string | null>(null)
  const [mappingOpen, setMappingOpen] = useState(false)

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/dashboard/${agentKey}/completed${refresh ? '?refresh=1' : ''}`, {
          cache: 'no-store',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'failed to load')
        setData(json)
        // Open the biggest type by default — with 26 measurable projects most of
        // the signal is in one or two types, and an all-collapsed table says nothing.
        setOpenType((cur) => cur ?? (json.byType as TypeGroupDTO[]).slice().sort((a, b) => b.measured - a.measured)[0]?.projectType ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [agentKey]
  )

  useEffect(() => { load() }, [load])

  const saveMapping = useCallback(
    async (subject: string, department: Department) => {
      if (!data) return
      // Optimistic: rebuild locally so the panel responds, then reload the real numbers.
      const next = Object.fromEntries(data.subjects.map((s) => [s.subject, s.department])) as Record<string, Department>
      next[subject] = department
      setData({ ...data, subjects: data.subjects.map((s) => (s.subject === subject ? { ...s, department } : s)) })
      await fetch(`/api/dashboard/${agentKey}/completed`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectDepartment: next }),
      })
      load()
    },
    [agentKey, data, load]
  )

  const t = data?.totals

  return (
    <div style={{ minHeight: '100vh', color: '#1f2430', background: 'linear-gradient(135deg,#f0f3ff 0%,#e7eefe 100%)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px 60px' }}>
        <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold mb-2 cursor-pointer"
              style={{ background: 'transparent', border: 'none', color: 'rgba(30,36,140,.7)', fontFamily: 'inherit', padding: 0 }}>
              <ArrowLeft size={13} /> Squirrel
            </button>
            <h1 className="text-3xl font-bold text-[#1e248c]">Completed Projects</h1>
            <p className="text-gray-500 text-sm mt-1">
              Hours we were paid for vs hours we spent, by סוג פרויקט and by department — on everything marked DONE on MA-004.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMappingOpen(true)} className={PILL}>
              <SlidersHorizontal size={13} /> Departments
            </button>
            <button onClick={() => load(true)} disabled={loading} className={PILL}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} /> Refresh
            </button>
          </div>
        </header>

        {error && (
          <div style={{ ...CARD, padding: '14px 18px', marginBottom: 18, borderColor: '#f4c7c7', background: '#fff7f7' }}>
            <span className="text-sm" style={{ color: '#b42318' }}>Couldn’t load: {error}</span>
          </div>
        )}

        {loading && !data && <Skeleton />}

        {data && t && (
          <>
            {/* Headline row. `measured` is the honest count: MA-004 marks more
                projects DONE than we hold timesheets and budgets for. */}
            <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
              <Tile
                label="Completed projects"
                value={t.projects}
                note={`${t.measured} with hours + budget`}
              />
              <Tile label="Hours banked" value={hrs(t.bankHours)} note="paid for, at ₪300/hr" />
              <Tile label="Hours spent" value={hrs(t.spentHours)} note={`${pctText(t.pct)} of the bank`} />
              <Tile
                label="Verdict"
                value={VERDICT_LABEL[t.verdict].badge}
                valueColor={VERDICT_COLOR[t.verdict]}
                note={VERDICT_LABEL[t.verdict].label}
                title={VERDICT_LABEL[t.verdict].hint}
              />
            </div>

            <div className="grid gap-4 items-start mb-5" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
              <VerdictSpread counts={t.verdictCounts} total={t.projects} />
              <DepartmentTotals rows={data.byDepartment} />
            </div>

            {/* The type table — the office manager's view. */}
            <div style={{ ...CARD, padding: '18px 22px 8px', marginBottom: 18 }}>
              <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">By project type</h3>
              <p className="text-[12px] text-gray-400 mt-0.5 mb-3">
                Open a type to see how each department did on it, and the projects behind the number.
              </p>
              {data.byType
                .slice()
                .sort((a, b) => b.measured - a.measured || b.projects - a.projects)
                .map((g) => (
                  <TypeRow
                    key={g.projectType}
                    group={g}
                    open={openType === g.projectType}
                    onToggle={() => setOpenType(openType === g.projectType ? null : g.projectType)}
                    projects={data.projects.filter((p) => p.projectType === g.projectType)}
                    openProject={openProject}
                    setOpenProject={setOpenProject}
                  />
                ))}
            </div>

            <Caveats data={data} />
          </>
        )}
      </div>

      {mappingOpen && data && (
        <DepartmentPanel subjects={data.subjects} onAssign={saveMapping} onClose={() => setMappingOpen(false)} />
      )}
    </div>
  )
}

const PILL =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50'

// ── pieces ─────────────────────────────────────────────────────────────────

function Tile({
  label, value, note, valueColor, title,
}: { label: string; value: string | number; note: string; valueColor?: string; title?: string }) {
  return (
    <div style={{ ...CARD, padding: '14px 18px' }} title={title}>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ letterSpacing: '-.02em', color: valueColor ?? '#1e248c' }}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-1">{note}</div>
    </div>
  )
}

const VERDICT_ORDER: Verdict[] = ['good', 'ok', 'over', 'unknown']

/** How the finished projects landed. One bar, four labelled segments. */
function VerdictSpread({ counts, total }: { counts: Record<Verdict, number>; total: number }) {
  return (
    <div style={{ ...CARD, padding: '18px 22px' }}>
      <h3 className="text-[15px] font-semibold text-[#1e248c] m-0 mb-1">How they landed</h3>
      <p className="text-[12px] text-gray-400 mt-0 mb-3">
        The office כדאיות rule: under שכ״ט ÷ 300 is profitable, past שכ״ט ÷ 225 is over break-even.
      </p>
      <div className="flex" style={{ height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
        {VERDICT_ORDER.map((v) =>
          counts[v] ? (
            <div
              key={v}
              title={`${counts[v]} ${VERDICT_LABEL[v].label} — ${VERDICT_LABEL[v].hint}`}
              style={{ width: `${(counts[v] / Math.max(total, 1)) * 100}%`, background: VERDICT_COLOR[v] }}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
        {VERDICT_ORDER.map((v) => (
          <span key={v} className="flex items-center gap-1.5 text-[12px]" title={VERDICT_LABEL[v].hint}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: VERDICT_COLOR[v], flex: 'none' }} />
            <span className="text-gray-600">{VERDICT_LABEL[v].label}</span>
            <span className="font-bold text-[#1e248c]">{counts[v]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function DepartmentTotals({ rows }: { rows: (DeptRollupDTO & { hebrew: string })[] }) {
  return (
    <div style={{ ...CARD, padding: '18px 22px' }}>
      <h3 className="text-[15px] font-semibold text-[#1e248c] m-0 mb-3">By department, all types</h3>
      <div className="flex flex-col gap-3">
        {rows.map((d) => (
          <div key={d.key}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="flex items-center gap-1.5 text-[12.5px] text-gray-700">
                <span style={{ width: 9, height: 9, borderRadius: 3, background: DEPT_COLOR[d.key], flex: 'none' }} />
                {d.label}
                <span className="text-[11px] text-gray-400" dir="rtl">{d.hebrew}</span>
              </span>
              <span className="text-[12px] font-semibold" style={{ color: VERDICT_COLOR[d.verdict] }}>
                {pctText(d.pct)}
              </span>
            </div>
            <Meter spent={d.spent} bank={d.bank} color={DEPT_COLOR[d.key]} />
            <div className="text-[11px] text-gray-400 mt-1">
              {hrs(d.spent)} spent of {hrs(d.bank)} banked · {d.priced} project{d.priced === 1 ? '' : 's'} priced for it
              {d.spentUnpriced > 0 && (
                <span title="Worked on projects whose board carries no price for this department, so there is no bank to judge them against.">
                  {' '}· +{hrs(d.spentUnpriced)} on unpriced projects
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Bank-vs-spent meter. Track = the bank; fill = hours spent; the tick marks
 * break-even. The fill can run past the track, which is exactly the case that
 * matters, so the scale is the larger of the two.
 */
function Meter({ spent, bank, color, height = 8 }: { spent: number; bank: number | null; color: string; height?: number }) {
  if (!bank || bank <= 0) {
    return (
      <div style={{ height, borderRadius: height / 2, background: '#f1f3f9', position: 'relative' }} title="No budget on the board for this">
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 9, color: '#b6bcc9' }}>
          no budget
        </div>
      </div>
    )
  }
  const ceiling = bank * CEILING_FACTOR
  const scale = Math.max(bank, spent, ceiling)
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`
  const over = spent > ceiling
  return (
    <div style={{ position: 'relative', height, borderRadius: height / 2, background: '#eef1f8', overflow: 'hidden' }}>
      {/* the bank, as a lighter shoulder behind the spend */}
      <div style={{ position: 'absolute', inset: 0, width: pct(bank), background: `${color}26` }} />
      <div style={{ position: 'absolute', inset: 0, width: pct(spent), background: over ? VERDICT_COLOR.over : color, borderRadius: height / 2 }} />
      {/* break-even tick — a 2px surface-coloured rule so it reads over any fill */}
      <div
        title="Break-even (שכ״ט ÷ 225)"
        style={{ position: 'absolute', top: -1, bottom: -1, left: pct(ceiling), width: 2, background: '#fff', opacity: 0.9 }}
      />
    </div>
  )
}

function VerdictBadge({ verdict, small = false }: { verdict: Verdict; small?: boolean }) {
  const m = VERDICT_LABEL[verdict]
  return (
    <span
      title={m.hint}
      className="inline-flex items-center gap-1 font-bold"
      style={{
        fontSize: small ? 10.5 : 11.5,
        color: VERDICT_COLOR[verdict],
        background: `${VERDICT_COLOR[verdict]}1a`,
        padding: small ? '2px 6px' : '3px 8px',
        borderRadius: 999,
      }}
    >
      {m.badge} <span style={{ fontWeight: 600 }}>{m.label}</span>
    </span>
  )
}

function TypeRow({
  group, open, onToggle, projects, openProject, setOpenProject,
}: {
  group: TypeGroupDTO
  open: boolean
  onToggle: () => void
  projects: CompletedProjectDTO[]
  openProject: string | null
  setOpenProject: (id: string | null) => void
}) {
  return (
    <div style={{ borderTop: '1px solid #eef1f8' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left cursor-pointer"
        style={{ padding: '13px 0', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
      >
        {open ? <ChevronDown size={15} style={{ color: ACCENT, flex: 'none' }} /> : <ChevronRight size={15} style={{ color: '#c3c9d6', flex: 'none' }} />}
        <span
          className="flex items-center justify-center font-bold"
          style={{ width: 34, height: 26, borderRadius: 8, background: ACCENT_BG, color: ACCENT, fontSize: 12.5, flex: 'none' }}
        >
          {group.projectType}
        </span>
        <div style={{ width: 150, flex: 'none' }}>
          <div className="text-[13px] font-semibold text-[#2b2f3a]">
            {group.projects} project{group.projects === 1 ? '' : 's'}
          </div>
          <div className="text-[11px] text-gray-400">
            {group.measured} measurable{group.avgMonths ? ` · ~${group.avgMonths} mo each` : ''}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 80 }}>
          <Meter spent={group.totalSpentHours} bank={group.totalBankHours || null} color={ACCENT} />
        </div>
        <div style={{ width: 150, flex: 'none', textAlign: 'right' }} className="text-[12px] text-gray-500">
          {hrs(group.totalSpentHours)} / {hrs(group.totalBankHours)}
        </div>
        <div style={{ width: 130, flex: 'none', textAlign: 'right' }}>
          <VerdictBadge verdict={group.verdict} />
        </div>
      </button>

      {open && (
        <div style={{ padding: '2px 0 16px 52px' }}>
          {/* department split for this type — the team leader's planning number */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            {group.departments.map((d) => (
              <div key={d.key} style={{ border: '1px solid #eef1f8', borderRadius: 12, padding: '10px 12px' }}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-700">
                    <span style={{ width: 8, height: 8, borderRadius: 2.5, background: DEPT_COLOR[d.key], flex: 'none' }} />
                    {DEPT_LABELS[d.key]}
                  </span>
                  <span className="text-[12px] font-bold" style={{ color: VERDICT_COLOR[d.verdict] }}>{pctText(d.pct)}</span>
                </div>
                <Meter spent={d.spent} bank={d.bank || null} color={DEPT_COLOR[d.key]} />
                <div className="text-[11px] text-gray-400 mt-1">
                  {d.priced === 0
                    ? d.spentUnpriced > 0
                      ? `${hrs(d.spentUnpriced)} worked, not priced here`
                      : 'not priced on these projects'
                    : `${hrs(d.spent)} of ${hrs(d.bank)} · ${d.priced} priced${d.spentUnpriced > 0 ? ` · +${hrs(d.spentUnpriced)} unpriced` : ''}`}
                </div>
              </div>
            ))}
          </div>

          {projects.map((p) => (
            <ProjectRow
              key={p.itemId}
              project={p}
              open={openProject === p.itemId}
              onToggle={() => setOpenProject(openProject === p.itemId ? null : p.itemId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectRow({ project: p, open, onToggle }: { project: CompletedProjectDTO; open: boolean; onToggle: () => void }) {
  const subjects = useMemo(
    () => Object.entries(p.hoursBySubject).sort((a, b) => b[1] - a[1]),
    [p.hoursBySubject]
  )
  return (
    <div style={{ borderTop: '1px solid #f4f6fb' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left cursor-pointer"
        style={{ padding: '9px 0', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
      >
        <span className="text-[11px] text-gray-400 font-mono" style={{ width: 56, flex: 'none' }}>{p.projectNumber ?? '—'}</span>
        <span dir="auto" className="text-[12.5px] text-[#2b2f3a]" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </span>
        {p.disagreesWithBoard && (
          <span title={`MA-004's כדאיות column says "${p.boardViability}" — it runs off the hand-entered סהכ שעות (${hrs(p.boardHours)}), not the timesheet.`}>
            <AlertTriangle size={12} style={{ color: '#f59e0b' }} />
          </span>
        )}
        <span style={{ width: 120, flex: 'none' }}>
          <Meter spent={p.total.spent} bank={p.total.bank} color={ACCENT} height={6} />
        </span>
        <span className="text-[11.5px] text-gray-500" style={{ width: 120, flex: 'none', textAlign: 'right' }}>
          {p.hasHours ? `${hrs(p.total.spent)} / ${hrs(p.total.bank)}` : 'no timesheet'}
        </span>
        <span style={{ width: 130, flex: 'none', textAlign: 'right' }}>
          <VerdictBadge verdict={p.total.verdict} small />
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 0 14px 56px' }} className="grid gap-4" >
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-gray-500">
            <Fact label="Fee" value={shekel(p.fee)} />
            <Fact label="Usage" value={p.usageType ?? '—'} />
            <Fact label="Service" value={p.service ?? '—'} />
            <Fact label="Area" value={p.totalArea ? `${Math.round(p.totalArea).toLocaleString()} m²` : '—'} />
            <Fact label="Ran for" value={fmtMonths(p.months)} />
            {p.quote?.quoteNumber && <Fact label="From quote" value={`#${p.quote.quoteNumber}`} />}
            <a href={p.mondayUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium" style={{ color: ACCENT }}>
              MA-004 <ExternalLink size={10} />
            </a>
          </div>

          {p.hasHours ? (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
                {p.departments.map((d) => (
                  <div key={d.key}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[11.5px] text-gray-600">{DEPT_LABELS[d.key]}</span>
                      <span className="text-[11.5px] font-semibold" style={{ color: VERDICT_COLOR[d.verdict] }}>{pctText(d.pct)}</span>
                    </div>
                    <Meter spent={d.spent} bank={d.bank} color={DEPT_COLOR[d.key]} height={6} />
                    <div className="text-[10.5px] text-gray-400 mt-1">{hrs(d.spent)} of {hrs(d.bank)}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Hours by subject</div>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map(([s, h]) => (
                    <span key={s} className="text-[11px]" style={{ padding: '3px 8px', borderRadius: 999, background: '#f5f7fc', color: '#5b6270' }}>
                      {s} <strong style={{ color: '#2b2f3a' }}>{Math.round(h)}h</strong>
                      {p.uncountedSubjects.includes(s) && <span style={{ color: '#b6bcc9' }}> · uncounted</span>}
                    </span>
                  ))}
                </div>
                {p.uncountedHours > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1.5 mb-0">
                    {hrs(p.uncountedHours)} sit on subjects assigned to no department — excluded from every bank above, included in the project total.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-[12px] text-gray-400 m-0">
              No timesheet rows for this project — it isn’t in EPM, so its hours can’t be counted.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-gray-400">{label}: </span>
      <span className="font-medium text-gray-700" dir="auto">{value}</span>
    </span>
  )
}

/** What the numbers do NOT cover. Stated on the card, not left for someone to discover. */
function Caveats({ data }: { data: CompletedDTO }) {
  const gap = data.totals.projects - data.totals.measured
  if (!gap && !data.totals.uncountedHours && !data.missingHours.length) return null
  return (
    <div style={{ ...CARD, padding: '14px 20px', background: '#fbfcff' }}>
      <div className="flex items-start gap-2">
        <Info size={14} style={{ color: '#9ca3af', flex: 'none', marginTop: 2 }} />
        <div className="text-[12px] text-gray-500 leading-relaxed">
          <strong className="text-gray-600">What these numbers don’t cover.</strong>{' '}
          {gap > 0 && (
            <>
              {gap} of the {data.totals.projects} DONE projects have no budget or no timesheet, so they carry no verdict and are left out of every ratio.{' '}
            </>
          )}
          {data.totals.uncountedHours > 0 && (
            <>
              {hrs(data.totals.uncountedHours)} sit on subjects assigned to no department — assign them under <em>Departments</em> to fold them into a bank.{' '}
            </>
          )}
          {data.missingHours.length > 0 && (
            <>
              No timesheet at all for: {data.missingHours.map((m) => m.projectNumber ?? m.name).join(', ')}.
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── the subject → department panel ─────────────────────────────────────────

const DEPT_CHOICES: { value: Department; label: string }[] = [
  { value: 'modelMgmt', label: 'Model MGMT' },
  { value: 'superposition', label: 'Superposition' },
  { value: 'modelling', label: 'Modelling' },
  { value: 'none', label: 'Not counted' },
]

function DepartmentPanel({
  subjects, onAssign, onClose,
}: {
  subjects: { subject: string; department: Department; hours: number }[]
  onAssign: (subject: string, department: Department) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(20,24,50,.28)' }} onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full flex flex-col"
        style={{ width: 420, background: '#fff', boxShadow: '-8px 0 28px rgba(30,36,140,.14)' }}
      >
        <header className="flex items-center gap-2 shrink-0" style={{ padding: '14px 18px', borderBottom: '1px solid #e7ebf5' }}>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-[#1e248c] m-0">Departments</h3>
            <p className="text-[11.5px] text-gray-400 m-0 mt-0.5">Which bank each timesheet subject is spent against.</p>
          </div>
          <button onClick={onClose} className="cursor-pointer" style={{ background: 'transparent', border: 'none', color: '#9ca3af' }}>
            <X size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto" style={{ padding: '10px 18px 20px' }}>
          <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3">
            This map is office-wide, so all completed projects are judged by the same rule — that is what makes
            “how did Type C go?” answerable. It is separate from the per-project mapping on EPM’s hours page, which
            only has two teams.
          </p>
          {subjects.map((s) => (
            <div key={s.subject} className="flex items-center gap-2" style={{ padding: '9px 0', borderTop: '1px solid #f1f4fa' }}>
              <div className="flex-1 min-w-0">
                <div dir="auto" className="text-[12.5px] text-[#2b2f3a] truncate">{s.subject}</div>
                <div className="text-[11px] text-gray-400">{hrs(s.hours)} on completed projects</div>
              </div>
              <select
                value={s.department}
                onChange={(e) => onAssign(s.subject, e.target.value as Department)}
                className="cursor-pointer"
                style={{ fontSize: 11.5, padding: '4px 6px', borderRadius: 8, border: '1px solid #dfe6f3', color: '#3a3f4d', background: '#fff', fontFamily: 'inherit' }}
              >
                {DEPT_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ ...CARD, padding: '14px 18px', height: 86, opacity: 0.6 }}>
          <div style={{ width: '60%', height: 10, borderRadius: 5, background: '#eef1f8' }} />
          <div style={{ width: '40%', height: 20, borderRadius: 6, background: '#eef1f8', marginTop: 10 }} />
        </div>
      ))}
    </div>
  )
}
