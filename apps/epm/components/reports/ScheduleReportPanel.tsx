'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Clock, Plus, X, Loader2, Mail, FileEdit, Trash2, Pencil, Play, Pause,
  AlertTriangle, CheckCircle2, Users, Send,
} from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import type { AccIssue, AccMember } from '@/lib/services/apsService'
import { type GroupKey, buildGroupOptions, statusLabel, normalizeStatus, dropDraft } from '@/lib/reportGrouping'
import { REPORT_TEMPLATES, resolveVariant, seedBodyLines, type ReportTemplate } from '@/lib/reportTemplates'
import { EMPTY_FILTERS, type ScheduleDTO, type ScheduleFilters, type ScheduleSeed } from '@/lib/scheduleTypes'
import { describeFrequency, formatInZone, WEEKDAYS_EN, DEFAULT_TZ, type Frequency } from '@/lib/scheduleTime'
import MultiSelect from '../MultiSelect'
import {
  UNASSIGNED, DISCIPLINE_LABELS, FIXED_FILTER_KEYS, groupLabelHe, issueParamValue,
} from './reportLocale'

// Schedule tab — define a recurring report (what, to whom, when) and manage the
// ones already running on this project. Sends are performed by the cron
// (/api/cron/report-schedules) using the owner's Autodesk + Google tokens.

const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface FormState {
  name:         string
  templateId:   string
  variantId:    string | null
  groupBy:      GroupKey
  filters:      ScheduleFilters
  bodyText:     string
  modelLink:    string
  recipients:   string[]
  deliveryMode: 'send' | 'draft'
  frequency:    Frequency
  active:       boolean
}

const DEFAULT_FREQUENCY: Frequency = { kind: 'weekly', weekday: 0, hour: 9, minute: 0 }

function blankForm(project: ProjectRow, groupBy: GroupKey): FormState {
  const t = REPORT_TEMPLATES[0]
  const v = t.variants?.[0]?.id ?? null
  return {
    name:         resolveVariant(t, v).title,
    templateId:   t.id,
    variantId:    v,
    groupBy,
    filters:      { ...EMPTY_FILTERS, extra: [] },
    bodyText:     seedBodyLines(resolveVariant(t, v).bodyLines, project.projectName),
    modelLink:    '',
    recipients:   [],
    deliveryMode: 'send',
    frequency:    { ...DEFAULT_FREQUENCY },
    active:       true,
  }
}

function formFrom(s: ScheduleDTO): FormState {
  return {
    name:         s.name,
    templateId:   s.templateId,
    variantId:    s.variantId ?? null,
    groupBy:      s.groupBy,
    filters:      { ...EMPTY_FILTERS, ...s.filters, extra: s.filters.extra ?? [] },
    bodyText:     s.bodyText,
    modelLink:    s.modelLink ?? '',
    recipients:   s.recipients,
    deliveryMode: s.deliveryMode,
    frequency:    s.frequency,
    active:       s.active,
  }
}

// ── Status pill for the management table ─────────────────────────────────────
function StatusPill({ s }: { s: ScheduleDTO }) {
  if (!s.active) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"><Pause size={9} /> Paused</span>
  }
  if (s.lastStatus === 'needs-auth') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><AlertTriangle size={9} /> Needs auth</span>
  }
  if (s.lastStatus === 'failed') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600"><AlertTriangle size={9} /> Failed</span>
  }
  if (s.lastStatus === 'ok') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={9} /> Active</span>
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e7eefe] text-[#1e248c]"><Clock size={9} /> Scheduled</span>
}

export default function ScheduleReportPanel({
  project, issues, assignees, issueTypes, disciplines, allStatuses, defaultGroupBy,
  onSchedulesChange, onReportSaved, seed, seedVersion = 0,
}: {
  project: ProjectRow
  issues: AccIssue[]
  assignees: string[]
  issueTypes: string[]
  disciplines: string[]
  allStatuses: string[]
  defaultGroupBy: GroupKey
  onSchedulesChange?: (count: number) => void
  onReportSaved?: () => void
  // Handed over by the Export tab's "תזמן את הדוח" — opens the new-schedule form
  // pre-filled with the export's configuration; only the cadence is left to pick.
  seed?: ScheduleSeed | null
  seedVersion?: number
}) {
  const [schedules, setSchedules] = useState<ScheduleDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // null = list only; 'new' or a schedule id = the form is open.
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => blankForm(project, defaultGroupBy))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [runNotice, setRunNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  const [members, setMembers] = useState<AccMember[]>([])
  const [manualEmail, setManualEmail] = useState('')

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }))

  // ── Load schedules + the ACC team (for recipient suggestions) ──
  const loadSchedules = async () => {
    try {
      const res = await fetch(`/api/projects/${project._id}/report-schedules`)
      const data = await res.json() as { schedules?: ScheduleDTO[]; error?: string }
      if (data.error) { setListError(data.error); return }
      setSchedules(data.schedules ?? [])
      onSchedulesChange?.((data.schedules ?? []).filter(s => s.active).length)
    } catch (e) {
      setListError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedules()
    fetch(`/api/projects/${project._id}/team`)
      .then(r => r.json())
      .then((d: { members?: AccMember[] }) => setMembers(d.members ?? []))
      .catch(() => { /* manual entry still works */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project._id])

  // Apply a hand-off from the Export tab: open the new-schedule form pre-filled
  // with the export's configuration (cadence/delivery stay at their defaults).
  useEffect(() => {
    if (!seed) return
    setForm({
      ...blankForm(project, defaultGroupBy),
      ...seed,
      filters: { ...EMPTY_FILTERS, ...seed.filters, extra: seed.filters.extra ?? [] },
    })
    setFormError(null)
    setEditing('new')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedVersion])

  // ── Derived options, mirroring the Export tab ──
  const groupOptions = useMemo(() => buildGroupOptions(issues), [issues])
  const statusOptions = useMemo(() => allStatuses.filter(s => normalizeStatus(s) !== 'draft'), [allStatuses])

  const extraParamOptions = useMemo(() => {
    const all = [...groupOptions, { value: 'createdBy', label: 'Created By' }]
    return all.filter(o =>
      !FIXED_FILTER_KEYS.has(o.value) &&
      !(o.value.startsWith('attr:') && DISCIPLINE_LABELS.includes(o.label.trim().toLowerCase())) &&
      !form.filters.extra.some(f => f.key === o.value)
    )
  }, [groupOptions, form.filters.extra])

  const valuesFor = (key: string): string[] =>
    [...new Set(issues.map(i => issueParamValue(i, key)))].filter(Boolean).sort((a, b) => a.localeCompare(b))

  const template = REPORT_TEMPLATES.find(t => t.id === form.templateId) ?? REPORT_TEMPLATES[0]
  const resolved = resolveVariant(template, form.variantId)
  const needsModelLink = resolved.linkKinds.includes('model')

  // How many issues the schedule would report on right now — a sanity check
  // before committing to a recurring send.
  const matchCount = useMemo(() => dropDraft(issues).filter(i => {
    const f = form.filters
    if (f.assignees.length && !f.assignees.includes(i.assignedTo?.trim() || 'Unassigned')) return false
    if (f.issueTypes.length && !f.issueTypes.includes(i.issueType)) return false
    if (f.disciplines.length && !f.disciplines.includes(i.discipline?.trim() || 'No Discipline')) return false
    for (const x of f.extra) {
      if (x.values.length && !x.values.includes(issueParamValue(i, x.key))) return false
    }
    return true
  }).length, [issues, form.filters])

  // ── Form actions ──
  const openNew = () => {
    setForm(blankForm(project, defaultGroupBy))
    setFormError(null)
    setEditing('new')
  }
  const openEdit = (s: ScheduleDTO) => {
    setForm(formFrom(s))
    setFormError(null)
    setEditing(s._id)
  }
  const closeForm = () => { setEditing(null); setFormError(null) }

  const pickTemplate = (t: ReportTemplate) => {
    const v = t.variants?.[0]?.id ?? null
    const r = resolveVariant(t, v)
    patch({
      templateId: t.id,
      variantId: v,
      name: r.title,
      bodyText: seedBodyLines(r.bodyLines, project.projectName),
      modelLink: '',
    })
  }
  const pickVariant = (v: string) => {
    const r = resolveVariant(template, v)
    patch({ variantId: v, name: r.title, bodyText: seedBodyLines(r.bodyLines, project.projectName) })
  }

  const addRecipient = (email: string) => {
    const e = email.trim().toLowerCase()
    if (!e || form.recipients.includes(e)) return
    patch({ recipients: [...form.recipients, e] })
  }
  const removeRecipient = (email: string) =>
    patch({ recipients: form.recipients.filter(r => r !== email) })

  const suggestions = members
    .filter(m => m.email && !form.recipients.includes(m.email.toLowerCase()))
    .slice(0, 8)

  const save = async () => {
    if (saving) return
    if (form.recipients.length === 0) { setFormError('Add at least one recipient'); return }
    const bad = form.recipients.find(r => !EMAIL_RE.test(r))
    if (bad) { setFormError(`Invalid address: ${bad}`); return }
    if (!form.bodyText.trim()) { setFormError('The email body cannot be empty'); return }

    setSaving(true); setFormError(null)
    try {
      const isNew = editing === 'new'
      const url = isNew
        ? `/api/projects/${project._id}/report-schedules`
        : `/api/projects/${project._id}/report-schedules/${editing}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, timezone: DEFAULT_TZ }),
      })
      const data = await res.json() as { schedule?: ScheduleDTO; error?: string }
      if (data.error) { setFormError(data.error); return }
      await loadSchedules()
      closeForm()
    } catch (e) {
      setFormError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (s: ScheduleDTO) => {
    setBusyId(s._id)
    try {
      await fetch(`/api/projects/${project._id}/report-schedules/${s._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !s.active }),
      })
      await loadSchedules()
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (s: ScheduleDTO) => {
    if (!confirm(`Delete the schedule "${s.name}"? Reports already sent are kept.`)) return
    setBusyId(s._id)
    try {
      await fetch(`/api/projects/${project._id}/report-schedules/${s._id}`, { method: 'DELETE' })
      await loadSchedules()
    } finally {
      setBusyId(null)
    }
  }

  const runNow = async (s: ScheduleDTO) => {
    const verb = s.deliveryMode === 'send' ? 'send this report now' : 'create the Gmail draft now'
    if (!confirm(`Run "${s.name}" — ${verb} to ${s.recipients.length} recipient(s)?`)) return
    setBusyId(s._id); setRunNotice(null)
    try {
      const res = await fetch(`/api/projects/${project._id}/report-schedules/${s._id}`, { method: 'POST' })
      const data = await res.json() as {
        result?: { status: string; error?: string; recipients?: number; issueCount?: number }
        error?: string
      }
      const r = data.result
      if (data.error || !r) {
        setRunNotice({ id: s._id, text: data.error ?? 'Run failed', ok: false })
      } else if (r.status === 'ok') {
        setRunNotice({
          id: s._id,
          text: s.deliveryMode === 'send'
            ? `Sent to ${r.recipients} recipient(s) · ${r.issueCount} issues`
            : `Draft created · ${r.issueCount} issues`,
          ok: true,
        })
        onReportSaved?.()
      } else {
        setRunNotice({ id: s._id, text: r.error ?? r.status, ok: false })
      }
      await loadSchedules()
    } catch (e) {
      setRunNotice({ id: s._id, text: String(e), ok: false })
    } finally {
      setBusyId(null)
    }
  }

  // ── Render ──
  const activeCount = schedules.filter(s => s.active).length

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-[#1e248c] text-sm flex items-center gap-2">
            <Clock size={15} className="text-[#44b8d3]" /> Scheduled reports
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {activeCount > 0
              ? `${activeCount} active on this project · times are ${DEFAULT_TZ.split('/')[1].replace('_', ' ')} time`
              : 'Send a report automatically on a recurring schedule.'}
          </p>
        </div>
        {editing === null && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e248c] text-white rounded-xl text-sm font-medium hover:bg-[#44b8d3] transition-colors shadow-sm"
          >
            <Plus size={15} /> New schedule
          </button>
        )}
      </div>

      {/* ── Form ── */}
      {editing !== null && (
        <div className="rounded-2xl border border-[#1e248c]/20 bg-[#f7f9ff] p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1e248c]">
              {editing === 'new' ? 'New schedule' : 'Edit schedule'}
            </h3>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          {/* Name */}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Schedule name</span>
            <input
              value={form.name}
              onChange={e => patch({ name: e.target.value })}
              placeholder="Weekly MEP status"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
            />
          </label>

          {/* Report type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Report template</span>
              <select
                value={form.templateId}
                onChange={e => pickTemplate(REPORT_TEMPLATES.find(t => t.id === e.target.value)!)}
                dir="rtl"
                className="w-full border border-[#1e248c]/30 rounded-lg px-3 py-2 text-sm bg-white font-medium text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
              >
                {REPORT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.title}</option>)}
              </select>
            </label>
            {template.variants && template.variants.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Variant</span>
                <select
                  value={form.variantId ?? ''}
                  onChange={e => pickVariant(e.target.value)}
                  dir="rtl"
                  className="w-full border border-[#1e248c]/30 rounded-lg px-3 py-2 text-sm bg-white font-medium text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
                >
                  {template.variants.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              </label>
            )}
          </div>

          {/* Cadence */}
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">When</span>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={form.frequency.kind}
                onChange={e => {
                  const kind = e.target.value as Frequency['kind']
                  patch({ frequency: {
                    ...form.frequency, kind,
                    weekday: kind === 'weekly' ? (form.frequency.weekday ?? 0) : undefined,
                    dayOfMonth: kind === 'monthly' ? (form.frequency.dayOfMonth ?? 1) : undefined,
                  } })
                }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>

              {form.frequency.kind === 'weekly' && (
                <select
                  value={form.frequency.weekday ?? 0}
                  onChange={e => patch({ frequency: { ...form.frequency, weekday: Number(e.target.value) } })}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
                >
                  {WEEKDAYS_EN.map((d, i) => <option key={d} value={i}>on {d}</option>)}
                </select>
              )}

              {form.frequency.kind === 'monthly' && (
                <select
                  value={form.frequency.dayOfMonth ?? 1}
                  onChange={e => patch({ frequency: { ...form.frequency, dayOfMonth: Number(e.target.value) } })}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>on day {d}</option>
                  ))}
                </select>
              )}

              <span className="text-xs text-gray-500">at</span>
              <input
                type="time"
                value={`${String(form.frequency.hour).padStart(2, '0')}:${String(form.frequency.minute).padStart(2, '0')}`}
                onChange={e => {
                  const [h, m] = e.target.value.split(':').map(Number)
                  patch({ frequency: { ...form.frequency, hour: h || 0, minute: m || 0 } })
                }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
              />
              <span className="text-[11px] text-gray-400">{DEFAULT_TZ}</span>
            </div>
            {/* Months shorter than the chosen day still fire, on the last day. */}
            {form.frequency.kind === 'monthly' && (form.frequency.dayOfMonth ?? 1) > 28 && (
              <p className="text-[10px] text-amber-600">
                In shorter months this runs on the last day instead.
              </p>
            )}
          </div>

          {/* Delivery */}
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Delivery</span>
            <div className="flex gap-2 flex-wrap">
              {([
                { v: 'send',  icon: <Send size={13} />,     label: 'Send automatically', hint: 'The email goes out at the scheduled time' },
                { v: 'draft', icon: <FileEdit size={13} />, label: 'Create draft only',  hint: 'A Gmail draft is prepared for you to review and send' },
              ] as const).map(o => {
                const sel = form.deliveryMode === o.v
                return (
                  <button
                    key={o.v}
                    onClick={() => patch({ deliveryMode: o.v })}
                    className={`flex-1 min-w-[200px] text-left rounded-xl border p-2.5 transition ${
                      sel ? 'border-2 border-[#1e248c] bg-[#e7eefe]' : 'border-gray-200 bg-white hover:border-[#44b8d3]'
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 text-xs font-bold ${sel ? 'text-[#1e248c]' : 'text-gray-700'}`}>
                      {o.icon} {o.label}
                    </span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">{o.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recipients */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Recipients</span>
            <div className="flex items-center gap-2 flex-wrap border border-gray-200 rounded-xl bg-white p-2 min-h-[44px]">
              {form.recipients.map(r => (
                <span key={r} className="inline-flex items-center gap-1.5 bg-[#e7eefe] border border-[#c7caea] text-[#1e248c] rounded-full px-2.5 py-1 text-xs font-medium">
                  {r}
                  <button onClick={() => removeRecipient(r)} className="text-[#9094c4] hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
              <input
                value={manualEmail}
                onChange={e => setManualEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addRecipient(manualEmail); setManualEmail('') }
                }}
                placeholder="Add an email address…"
                className="flex-1 min-w-[160px] border-none outline-none text-xs bg-transparent text-gray-700"
              />
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {suggestions.map(m => (
                  <button key={m.email} onClick={() => addRecipient(m.email)}
                    className="inline-flex items-center gap-1.5 border border-dashed border-gray-300 hover:border-[#44b8d3] rounded-full px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 bg-white">
                    <span className="w-4 h-4 rounded-full bg-gray-100 border border-gray-200 text-[8px] grid place-items-center">{initials(m.name)}</span>
                    {m.name}{m.role ? ` · ${m.role}` : ''}
                    <Plus size={11} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grouping + filters */}
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Content</span>
              <span className="text-[10px] text-gray-400">{matchCount} issues match right now</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase text-[#1e248c]">Stack by</span>
              <select
                value={form.groupBy}
                onChange={e => patch({ groupBy: e.target.value })}
                dir="rtl"
                className="border border-[#1e248c]/30 rounded-lg px-2 py-1.5 text-sm bg-[#e7eefe]/60 font-medium text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
              >
                {groupOptions.map(o => <option key={o.value} value={o.value}>{groupLabelHe(o.value)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase text-gray-400">Assignee</span>
                <MultiSelect
                  placeholder="All" options={assignees} selected={form.filters.assignees}
                  renderLabel={n => (n === 'Unassigned' ? UNASSIGNED : n)}
                  onChange={v => patch({ filters: { ...form.filters, assignees: v } })}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase text-gray-400">Type</span>
                <MultiSelect
                  placeholder="All" options={issueTypes} selected={form.filters.issueTypes}
                  onChange={v => patch({ filters: { ...form.filters, issueTypes: v } })}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase text-gray-400">Discipline</span>
                <MultiSelect
                  placeholder="All" options={disciplines} selected={form.filters.disciplines}
                  onChange={v => patch({ filters: { ...form.filters, disciplines: v } })}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase text-gray-400">Status</span>
                <MultiSelect
                  placeholder="All" options={statusOptions} selected={form.filters.statuses}
                  renderLabel={statusLabel}
                  onChange={v => patch({ filters: { ...form.filters, statuses: v } })}
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400">
              Status narrows the emailed chart only — the PDF and Excel always carry every status (except Draft).
            </p>

            {/* Ad-hoc parameter filters */}
            {form.filters.extra.map((f, idx) => (
              <div key={f.key} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono uppercase text-[#1e248c]">{groupLabelHe(f.key)}</span>
                <MultiSelect
                  placeholder="Any"
                  options={valuesFor(f.key)}
                  selected={f.values}
                  onChange={vals => patch({ filters: {
                    ...form.filters,
                    extra: form.filters.extra.map((x, i) => (i === idx ? { ...x, values: vals } : x)),
                  } })}
                />
                <button
                  onClick={() => patch({ filters: {
                    ...form.filters, extra: form.filters.extra.filter((_, i) => i !== idx),
                  } })}
                  title="Remove this filter"
                  className="text-gray-400 hover:text-red-500"
                ><X size={13} /></button>
              </div>
            ))}
            {extraParamOptions.length > 0 && (
              <select
                value=""
                onChange={e => {
                  if (!e.target.value) return
                  patch({ filters: { ...form.filters, extra: [...form.filters.extra, { key: e.target.value, values: [] }] } })
                }}
                className="self-start border border-dashed border-[#1e248c]/40 rounded-lg px-2.5 py-1.5 text-xs bg-white text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
              >
                <option value="">+ Add filter…</option>
                {extraParamOptions.map(o => <option key={o.value} value={o.value}>{groupLabelHe(o.value)}</option>)}
              </select>
            )}
          </div>

          {/* Email body */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Email body</span>
            <textarea
              value={form.bodyText}
              onChange={e => patch({ bodyText: e.target.value })}
              rows={Math.min(12, Math.max(5, form.bodyText.split('\n').length))}
              dir="rtl"
              className="w-full resize-y text-xs text-gray-700 leading-relaxed border border-gray-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20 text-right"
            />
            {needsModelLink && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 mt-1" dir="rtl">
                <label className="block text-[11px] font-bold text-amber-800 mb-1">
                  קישור למודל ב-ACC (לעריכה ידנית)
                </label>
                <input
                  type="url"
                  value={form.modelLink}
                  onChange={e => patch({ modelLink: e.target.value })}
                  placeholder="הדבק כאן את הקישור למודל הספציפי ב-ACC"
                  dir="ltr"
                  className="w-full text-xs text-gray-800 bg-white border border-amber-300 rounded-md p-2 text-left focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                />
                <p className="text-[10px] text-amber-700 mt-1">
                  This template links to a model. Every scheduled send reuses this URL — leave it empty and the
                  link renders highlighted, unresolved.
                </p>
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e248c] text-white rounded-xl text-sm font-bold hover:bg-[#44b8d3] transition shadow-md disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />}
              {saving ? 'Saving…' : editing === 'new' ? 'Create schedule' : 'Save changes'}
            </button>
            <button onClick={closeForm} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 ml-auto">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => patch({ active: e.target.checked })}
                className="accent-[#1e248c]"
              />
              Active
            </label>
          </div>
          {formError && <p className="text-[11px] text-red-500">{formError}</p>}
        </div>
      )}

      {/* ── Management table ── */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Schedules on this project
          </span>
          <span className="text-[10px] text-gray-400">{schedules.length} total</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
            <Loader2 size={16} className="animate-spin" /><span className="text-xs">Loading schedules…</span>
          </div>
        )}

        {!loading && listError && (
          <p className="px-4 py-6 text-xs text-red-500">{listError}</p>
        )}

        {!loading && !listError && schedules.length === 0 && (
          <div className="px-4 py-10 text-center text-gray-400">
            <Clock size={26} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No schedules yet.</p>
            <p className="text-xs mt-0.5">Create one and the report goes out on its own.</p>
          </div>
        )}

        {!loading && schedules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-100 text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-500">Report</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Cadence</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Recipients</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Next run</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Last run</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Status</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s, i) => (
                  <tr key={s._id} className={`border-b border-gray-100 last:border-0 ${i % 2 ? 'bg-blue-50/20' : 'bg-white'} ${s.active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-800">{s.name}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                        {s.deliveryMode === 'send'
                          ? <><Mail size={9} /> auto-send</>
                          : <><FileEdit size={9} /> draft only</>}
                        {s.ownerName ? ` · ${s.ownerName}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{describeFrequency(s.frequency)}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      <span
                        className="inline-flex items-center gap-1 cursor-help"
                        title={s.recipients.join('\n')}
                      >
                        <Users size={11} className="text-gray-400" /> {s.recipients.length}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {s.active ? formatInZone(s.nextRunAt, s.timezone) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {formatInZone(s.lastRunAt, s.timezone)}
                      {s.runCount > 0 && <span className="text-[10px] text-gray-400"> · {s.runCount}×</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill s={s} />
                      {s.lastStatus && s.lastStatus !== 'ok' && s.lastError && (
                        <p className="text-[10px] text-red-400 mt-0.5 max-w-[220px] truncate" title={s.lastError}>
                          {s.lastError}
                        </p>
                      )}
                      {runNotice?.id === s._id && (
                        <p className={`text-[10px] mt-0.5 ${runNotice.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                          {runNotice.text}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {busyId === s._id && <Loader2 size={13} className="animate-spin text-gray-400" />}
                        <button onClick={() => runNow(s)} disabled={busyId === s._id}
                          title="Run now (test)" className="p-1 text-gray-400 hover:text-[#1e248c] disabled:opacity-40">
                          <Play size={13} />
                        </button>
                        <button onClick={() => toggleActive(s)} disabled={busyId === s._id}
                          title={s.active ? 'Pause' : 'Resume'} className="p-1 text-gray-400 hover:text-[#1e248c] disabled:opacity-40">
                          {s.active ? <Pause size={13} /> : <Play size={13} className="text-emerald-500" />}
                        </button>
                        <button onClick={() => openEdit(s)} disabled={busyId === s._id}
                          title="Edit" className="p-1 text-gray-400 hover:text-[#1e248c] disabled:opacity-40">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => remove(s)} disabled={busyId === s._id}
                          title="Delete" className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {schedules.some(s => s.lastStatus === 'needs-auth') && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            A schedule couldn&apos;t reach Autodesk or Gmail with the owner&apos;s saved access.
            Use <span className="font-semibold">Reconnect Autodesk</span> in the page header (and re-run the
            report once) to restore it — the schedule resumes on its next slot.
          </p>
        </div>
      )}
    </div>
  )
}
