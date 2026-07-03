'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useUser, useReverification } from '@clerk/nextjs'
import { isReverificationCancelledError } from '@clerk/nextjs/errors'
import { toPng } from 'html-to-image'
import { Download, Mail, X, Check, FileText, FileSpreadsheet, Plus, Loader2, ExternalLink } from 'lucide-react'
import type { ProjectRow } from '@/lib/types'
import type { AccIssue, AccMember } from '@/lib/services/apsService'
import { type GroupKey, buildGroupOptions, groupValue, statusLabel } from '@/lib/reportGrouping'
import {
  REPORT_TEMPLATES, pdfNameFor, matchHints, seedBodyLines, accIssuesUrl, segmentBodyText, resolveVariant,
  type ReportTemplate, type BodyLink,
} from '@/lib/reportTemplates'
import { buildEmailHtml } from '@/lib/emailHtml'
import type { ReportMeta } from '@/lib/server/reportHtml'
import MultiSelect from './MultiSelect'
import AnalyticsBars from './AnalyticsBars'

// Gmail scope the draft API needs; requested when (re)connecting the Google account.
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.compose'

const UNASSIGNED = 'לא משויך'
// Hebrew labels for the base stack-by dimensions; custom-attribute options
// (Discipline, Level, תחום, …) show their attribute title as-is.
const GROUP_LABELS_HE: Record<string, string> = {
  assignedTo: 'משויך אל', status: 'סטטוס', issueType: 'סוג נושא', dueDate: 'תאריך יעד',
  discipline: 'דיסציפלינה', createdBy: 'נוצר על ידי',
}
function groupLabelHe(value: string): string {
  if (GROUP_LABELS_HE[value]) return GROUP_LABELS_HE[value]
  if (value.startsWith('attr:')) {
    const title = value.slice(5)
    // Show the discipline attribute in Hebrew (the ACC title is English "Discipline").
    if (['discipline', 'disciplines'].includes(title.trim().toLowerCase())) return 'דיסציפלינה'
    return title
  }
  return value
}

// The fixed filter rows already cover these; keep them out of the "any column" picker.
const FIXED_FILTER_KEYS = new Set(['assignedTo', 'status', 'issueType'])
const DISCIPLINE_LABELS = ['discipline', 'disciplines', 'תחום', 'דיסציפלינה', 'משמעת']

// Value of any parameter for an issue (base dimensions, createdBy, or a custom attr:*).
function issueParamValue(i: AccIssue, key: string): string {
  if (key === 'createdBy') return i.createdBy?.trim() || 'לא ידוע'
  return groupValue(i, key)
}
const localizeGroup = (n: string) =>
  n === 'Unassigned' ? UNASSIGNED : n === 'No Discipline' ? 'ללא דיסציפלינה' : n === 'Other' ? 'אחר' : n

const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2)

// Strip the "data:image/png;base64," prefix from a data URL.
const stripDataUrl = (d: string) => d.slice(d.indexOf(',') + 1)

// Amber pill for a manually-edited link, mirroring the email's HIGHLIGHT_STYLE.
const HIGHLIGHT_PREVIEW: React.CSSProperties = {
  backgroundColor: '#fde68a', color: '#92400e', textDecoration: 'underline',
  padding: '0 3px', borderRadius: 3,
}

export default function ExportReportModal({
  open, onClose, project, issues, issueTypes, disciplines, allStatuses, assignees,
  defaultGroupBy, defaultAssignees, defaultTypes, defaultDisciplines,
}: {
  open: boolean
  onClose: () => void
  project: ProjectRow
  issues: AccIssue[]
  allStatuses: string[]
  issueTypes: string[]
  disciplines: string[]
  assignees: string[]
  // Defaults inherited from the reports page (stack-by + filter selections).
  defaultGroupBy: GroupKey
  defaultAssignees: string[]
  defaultTypes: string[]
  defaultDisciplines: string[]
}) {
  const { user } = useUser()
  // Connecting / reauthorizing a Google account is a Clerk-protected action: it
  // can require step-up "reverification". Wrapping the calls makes Clerk pop its
  // reverification modal and retry, instead of throwing session_reverification_required.
  const createExternalAccount = useReverification(
    (params: Parameters<NonNullable<typeof user>['createExternalAccount']>[0]) =>
      user!.createExternalAccount(params)
  )
  type ExternalAccount = NonNullable<typeof user>['externalAccounts'][number]
  const reauthorizeAccount = useReverification(
    (account: ExternalAccount, params: Parameters<ExternalAccount['reauthorize']>[0]) =>
      account.reauthorize(params)
  )

  const [templateId, setTemplateId] = useState<string>(REPORT_TEMPLATES[0].id)
  const [selAssignees, setSelAssignees] = useState<string[]>(defaultAssignees)
  const [selIssueTypes, setSelIssueTypes] = useState<string[]>(defaultTypes)
  const [selDisciplines, setSelDisciplines] = useState<string[]>(defaultDisciplines)
  const [selStatuses, setSelStatuses] = useState<string[]>([])
  // Ad-hoc "filter by any column" rows: { key, values }.
  const [extraFilters, setExtraFilters] = useState<{ key: string; values: string[] }[]>([])
  const [groupBy, setGroupBy] = useState<GroupKey>(defaultGroupBy)
  const [bodyText, setBodyText] = useState('')
  // Manually-edited link to the ACC model (only for templates with needsModelLink).
  const [modelLink, setModelLink] = useState('')
  // Selected report variant (for templates that define variants, e.g. MEP).
  const [variantId, setVariantId] = useState<string | null>(null)
  const [recipients, setRecipients] = useState<AccMember[]>([])
  const [members, setMembers] = useState<AccMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [manualEmail, setManualEmail] = useState('')

  const [pdfBusy, setPdfBusy] = useState(false)
  const [xlsxBusy, setXlsxBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draftUrl, setDraftUrl] = useState<string | null>(null)
  const [needsGoogle, setNeedsGoogle] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchedRef = useRef(false)
  const emailChartRef = useRef<HTMLDivElement>(null)

  const template = REPORT_TEMPLATES.find(t => t.id === templateId)!
  // Effective title / body config for the selected variant (or the template itself).
  const resolved = resolveVariant(template, variantId)
  // Prefer a deep link to the project's Issues tab; fall back to the project home.
  const accLink = project.accProjectId ? accIssuesUrl(project.accProjectId) : project.links?.acc
  // Build the ordered link targets from the resolved link sequence:
  // 'issues' → auto Issues-tab link; 'model' → manually-edited link (amber).
  const linkKinds = resolved.linkKinds
  const needsModelLink = linkKinds.includes('model')
  const links: BodyLink[] = linkKinds.map(kind =>
    kind === 'model'
      ? { href: modelLink.trim() || undefined, highlight: true }
      : { href: accLink }
  )

  const seedFilters = (t: ReportTemplate) => {
    setSelIssueTypes(matchHints(t.issueTypeHints, issueTypes))
    setSelDisciplines(matchHints(t.disciplineHints, disciplines))
    setSelStatuses([]) // show all statuses by default
  }
  const seedRecipients = (t: ReportTemplate, list: AccMember[]) => {
    const lowered = t.roleHints.map(h => h.toLowerCase())
    setRecipients(list.filter(m => m.role && lowered.some(h => m.role.toLowerCase().includes(h))))
  }
  const seedBody = (t: ReportTemplate, vId: string | null) => {
    setBodyText(seedBodyLines(resolveVariant(t, vId).bodyLines, project.projectName))
    setModelLink('')
  }

  // Switch the report variant (re-seeds the body from the variant's copy).
  const pickVariant = (vId: string) => {
    setVariantId(vId)
    seedBody(template, vId)
  }

  // On open: seed filters/body + fetch members once
  useEffect(() => {
    if (!open) return
    const vId = template.variants?.[0]?.id ?? null
    setVariantId(vId)
    seedFilters(template)
    seedBody(template, vId)
    setDraftUrl(null); setNeedsGoogle(false); setActionError(null)
    if (fetchedRef.current) return
    fetchedRef.current = true
    setMembersLoading(true)
    fetch(`/api/projects/${project._id}/team`)
      .then(async r => {
        const data = await r.json() as { members?: AccMember[]; error?: string }
        if (data.error) setMembersError(data.error)
        const list = data.members ?? []
        setMembers(list)
        seedRecipients(template, list)
      })
      .catch(e => setMembersError(String(e)))
      .finally(() => setMembersLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const pickTemplate = (t: ReportTemplate) => {
    const vId = t.variants?.[0]?.id ?? null
    setTemplateId(t.id)
    setVariantId(vId)
    seedFilters(t)
    seedBody(t, vId)
    seedRecipients(t, members)
    setDraftUrl(null)
  }

  // Stack-by options mirror the reports page (base dims + custom attributes).
  const groupOptions = useMemo(() => buildGroupOptions(issues), [issues])

  // "Filter by any column": every dimension not already a fixed filter row and
  // not already added — Due Date, Created By, and each custom attribute.
  const extraParamOptions = useMemo(() => {
    const all = [...groupOptions, { value: 'createdBy', label: 'Created By' }]
    return all.filter(o =>
      !FIXED_FILTER_KEYS.has(o.value) &&
      !(o.value.startsWith('attr:') && DISCIPLINE_LABELS.includes(o.label.trim().toLowerCase())) &&
      !extraFilters.some(f => f.key === o.value)
    )
  }, [groupOptions, extraFilters])

  // Distinct values available for a chosen parameter.
  const valuesFor = (key: string): string[] =>
    [...new Set(issues.map(i => issueParamValue(i, key)))].filter(Boolean).sort((a, b) => a.localeCompare(b))

  // Each time the modal opens, seed stack-by + filters from the reports page.
  // (Only on the open transition, so re-renders don't wipe in-modal edits.)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true
      setGroupBy(defaultGroupBy)
      setSelAssignees(defaultAssignees)
      setSelIssueTypes(defaultTypes)
      setSelDisciplines(defaultDisciplines)
      setSelStatuses([]) // Status is an export-only extra; starts unfiltered.
      setExtraFilters([])
    } else if (!open) {
      wasOpen.current = false
    }
  }, [open, defaultGroupBy, defaultAssignees, defaultTypes, defaultDisciplines])

  // "Final summary" templates (forceAllIssues) reset to ALL issues, grouped by
  // discipline — overriding the page-seeded defaults when such a template is picked.
  useEffect(() => {
    if (!open || !template.forceAllIssues) return
    setSelAssignees([]); setSelIssueTypes([]); setSelDisciplines([]); setSelStatuses([]); setExtraFilters([])
    const disc = groupOptions.find(o => o.value.startsWith('attr:') && DISCIPLINE_LABELS.includes(o.label.trim().toLowerCase()))
    setGroupBy(disc?.value ?? 'discipline')
  }, [templateId, open, template.forceAllIssues, groupOptions])

  // Issues after the modal's own assignee / status / issue-type / discipline selections
  const effectiveIssues = useMemo(() => issues.filter(i => {
    if (selAssignees.length && !selAssignees.includes(i.assignedTo?.trim() || 'Unassigned')) return false
    if (selStatuses.length && !selStatuses.includes(i.status)) return false
    if (selIssueTypes.length && !selIssueTypes.includes(i.issueType)) return false
    const disc = i.discipline?.trim() || 'No Discipline'
    if (selDisciplines.length && !selDisciplines.includes(disc)) return false
    // Ad-hoc "any column" filters
    for (const f of extraFilters) {
      if (f.values.length && !f.values.includes(issueParamValue(i, f.key))) return false
    }
    return true
  }), [issues, selAssignees, selStatuses, selIssueTypes, selDisciplines, extraFilters])

  const subject = `${resolved.title} — ${project.projectName}`
  const pdfName = pdfNameFor(template, project.projectName, project.projectNumber)
  const xlsxName = pdfName.replace(/\.pdf$/i, '.xlsx')
  const pdfPages = Math.max(1, Math.ceil(effectiveIssues.length / 15))
  const filtersSummary = [
    selAssignees.length ? `משויך: ${selAssignees.map(a => (a === 'Unassigned' ? UNASSIGNED : a)).join(', ')}` : '',
    selStatuses.length ? `סטטוס: ${selStatuses.map(statusLabel).join(', ')}` : '',
    selIssueTypes.length ? `סוג: ${selIssueTypes.join(', ')}` : '',
    selDisciplines.length ? `דיסציפלינה: ${selDisciplines.join(', ')}` : '',
    ...extraFilters.filter(f => f.values.length).map(f => `${groupLabelHe(f.key)}: ${f.values.join(', ')}`),
  ].filter(Boolean).join(' · ') || 'ללא סינון'

  // Payload the server uses to render the PDF + Excel.
  const reportMeta: ReportMeta = {
    projectName: project.projectName,
    projectNumber: project.projectNumber,
    templateTitle: resolved.title,
    groupBy,
    groupLabel: groupLabelHe(groupBy),
    filtersSummary,
  }


  const addManual = () => {
    const email = manualEmail.trim()
    if (!email || recipients.some(r => r.email === email)) { setManualEmail(''); return }
    setRecipients(prev => [...prev, { id: email, name: email, email, role: '', companyName: '' }])
    setManualEmail('')
  }
  const removeRecipient = (email: string) => setRecipients(prev => prev.filter(r => r.email !== email))
  const addMember = (m: AccMember) => {
    if (!recipients.some(r => r.email === m.email)) setRecipients(prev => [...prev, m])
  }
  const suggestions = members.filter(m => !recipients.some(r => r.email === m.email)).slice(0, 8)
  const toLine = recipients.length ? recipients.map(r => r.name).join(' · ') : '—'

  // ── PDF review (server-rendered via headless Chromium) ────────────────────
  const handleOpenPdf = async () => {
    if (pdfBusy) return
    setPdfBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/projects/${project._id}/report-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: reportMeta, issues: effectiveIssues, pdfName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (e) {
      setActionError('שגיאה ביצירת ה-PDF: ' + String(e))
    } finally {
      setPdfBusy(false)
    }
  }

  // ── Excel review (download) ───────────────────────────────────────────────
  const handleOpenXlsx = async () => {
    if (xlsxBusy) return
    setXlsxBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/projects/${project._id}/report-xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues: effectiveIssues, xlsxName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = xlsxName
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) {
      setActionError('שגיאה ביצירת ה-Excel: ' + String(e))
    } finally {
      setXlsxBusy(false)
    }
  }

  // ── Connect Google (Clerk) ────────────────────────────────────────────────
  const connectGoogle = async () => {
    if (!user) return
    try {
      // If a Google account is already connected (but lacking the Gmail scope),
      // reauthorize it to grant the scope — creating a new one fails with
      // oauth_account_already_connected. Otherwise connect fresh, requesting the scope.
      const existing = user.externalAccounts.find(a => a.provider === 'google')
      const res = existing
        ? await reauthorizeAccount(existing, {
            additionalScopes: [GMAIL_SCOPE],
            redirectUrl: window.location.href,
          })
        : await createExternalAccount({
            strategy: 'oauth_google',
            additionalScopes: [GMAIL_SCOPE],
            redirectUrl: window.location.href,
          })
      const url = res.verification?.externalVerificationRedirectURL
      if (url) window.location.href = url.toString()
    } catch (e) {
      // User dismissed the reverification modal → not an error to surface.
      if (isReverificationCancelledError(e)) return
      setActionError('לא ניתן לחבר את חשבון Google: ' + String(e))
    }
  }

  // ── Create Gmail draft ────────────────────────────────────────────────────
  const handleCreateDraft = async () => {
    if (creating) return
    if (recipients.length === 0) { setActionError('יש לבחור לפחות נמען אחד'); return }
    setCreating(true); setActionError(null); setDraftUrl(null); setNeedsGoogle(false)
    try {
      // 1. email parts — the SERVER builds the final HTML (with hosted image URLs)
      const emailParts = {
        bodyText, links, highlightPhrases: resolved.highlightPhrases,
        hasChart: true, hasScreenshot: !!template.bodyImage,
      }
      // 2. chart PNG (hidden fixed-width node)
      let chartPngBase64: string | undefined
      if (emailChartRef.current) {
        if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* ignore */ } }
        const dataUrl = await toPng(emailChartRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' })
        chartPngBase64 = stripDataUrl(dataUrl)
      }
      // 3. screenshot → base64 (CID)
      let screenshotPngBase64: string | undefined
      if (template.bodyImage) {
        try {
          const res = await fetch(template.bodyImage)
          const blob = await res.blob()
          const dataUrl: string = await new Promise((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result as string)
            fr.onerror = reject
            fr.readAsDataURL(blob)
          })
          screenshotPngBase64 = stripDataUrl(dataUrl)
        } catch { /* screenshot optional */ }
      }
      // 4. Self-contained preview HTML (images inlined) — saved for report history.
      const previewHtml = buildEmailHtml({
        bodyText, links, highlightPhrases: resolved.highlightPhrases,
        hasChart: true, hasScreenshot: !!template.bodyImage,
        inline: { chartBase64: chartPngBase64, screenshotBase64: screenshotPngBase64 },
      })
      // 5. POST — server renders the PDF (Chromium) + Excel from meta/issues.
      const res = await fetch(`/api/projects/${project._id}/gmail-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipients.map(r => r.email),
          subject, emailParts, pdfName, xlsxName,
          meta: reportMeta, issues: effectiveIssues,
          chartPngBase64, screenshotPngBase64,
          title: resolved.title, previewHtml,
          issueCount: effectiveIssues.length, filtersSummary, groupBy,
        }),
      })
      const data = await res.json() as { draftId?: string; needsGoogleAuth?: boolean; error?: string }
      if (data.needsGoogleAuth) { setNeedsGoogle(true); return }
      if (data.error) { setActionError(data.error); return }
      if (data.draftId) {
        const url = `https://mail.google.com/mail/u/0/#drafts?compose=${data.draftId}`
        setDraftUrl(url)
        window.open(url, '_blank')
      }
    } catch (e) {
      setActionError('שגיאה ביצירת הטיוטה: ' + String(e))
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 md:p-8"
      style={{ background: 'rgba(28,32,52,0.55)', backdropFilter: 'blur(2px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div dir="rtl" className="w-full max-w-[1000px] my-auto bg-white rounded-2xl shadow-2xl border border-[#e8eaff] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-l from-[#f0f3ff] to-white">
          <div className="w-9 h-9 rounded-lg grid place-items-center text-white" style={{ background: 'linear-gradient(135deg,#1e248c,#44b8d3)' }}>
            <Download size={17} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1e248c] leading-tight">ייצוא דוח</h1>
            <p className="text-xs text-gray-500" dir="rtl">{project.projectName}</p>
          </div>
          <button onClick={onClose} className="ms-auto w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <X size={16} />
          </button>
        </div>

        {/* Body — split: config (right) / preview (left) */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── Config pane ── */}
          <div className="flex flex-col gap-5">
            {/* Templates */}
            <section>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2">תבנית</p>
              <div className="flex flex-col gap-2">
                {REPORT_TEMPLATES.map(t => {
                  const sel = t.id === templateId
                  return (
                    <button
                      key={t.id}
                      onClick={() => pickTemplate(t)}
                      className={`flex items-center gap-3 text-right rounded-xl border p-3 transition ${
                        sel ? 'border-2 border-[#1e248c] bg-[#e7eefe]' : 'border-gray-200 bg-white hover:border-[#44b8d3]'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg grid place-items-center text-base shrink-0 border ${sel ? 'border-[#1e248c] text-[#1e248c]' : 'border-gray-300 text-gray-500'}`}>{t.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-gray-800 truncate">{t.title}</span>
                        <span className="block text-[11px] text-gray-500 truncate">{t.desc}</span>
                      </span>
                      {sel
                        ? <span className="flex items-center gap-1 text-[10px] font-mono text-[#1e248c]"><Check size={12} /> נבחר</span>
                        : <span className="text-[10px] font-mono text-gray-400">בחר</span>}
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Variant picker — only for templates that define variants */}
            {template.variants && template.variants.length > 0 && (
              <section>
                <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2">סוג הדוח</p>
                <select
                  value={variantId ?? ''}
                  onChange={e => pickVariant(e.target.value)}
                  dir="rtl"
                  className="w-full border border-[#1e248c]/30 rounded-lg px-3 py-2 text-sm bg-[#e7eefe]/60 font-medium text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
                >
                  {template.variants.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              </section>
            )}

            {/* Stack By — mirrors the reports page's grouping */}
            <section>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2">קיבוץ</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <span className="text-[10px] font-mono uppercase text-[#1e248c]">קבץ לפי</span>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupKey)}
                  dir="rtl"
                  className="border border-[#1e248c]/30 rounded-lg px-2 py-1.5 text-sm bg-[#e7eefe]/60 font-medium text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
                >
                  {groupOptions.map(o => <option key={o.value} value={o.value}>{groupLabelHe(o.value)}</option>)}
                </select>
              </div>
            </section>

            {/* Filter — seeded from the reports page (assignee / type / discipline) + status */}
            <section>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2">סינון</p>
              <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase text-gray-400">משויך אל</span>
                  <MultiSelect placeholder="כל המשויכים" options={assignees} selected={selAssignees} onChange={setSelAssignees} renderLabel={n => (n === 'Unassigned' ? UNASSIGNED : n)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase text-gray-400">סוג נושא</span>
                  <MultiSelect placeholder="כל הסוגים" options={issueTypes} selected={selIssueTypes} onChange={setSelIssueTypes} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase text-gray-400">דיסציפלינה</span>
                  <MultiSelect placeholder="הכל" options={disciplines} selected={selDisciplines} onChange={setSelDisciplines} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase text-gray-400">סטטוס</span>
                  <MultiSelect placeholder="כל הסטטוסים" options={allStatuses} selected={selStatuses} onChange={setSelStatuses} renderLabel={statusLabel} />
                </div>
              </div>

              {/* Filter by any other column/attribute */}
              <div className="flex flex-col gap-2 mt-2">
                {extraFilters.map((f, idx) => (
                  <div key={f.key} className="flex items-center gap-1.5 flex-wrap bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <span className="text-[10px] font-mono uppercase text-[#1e248c]">{groupLabelHe(f.key)}</span>
                    <MultiSelect
                      placeholder="ערך"
                      options={valuesFor(f.key)}
                      selected={f.values}
                      onChange={vals => setExtraFilters(prev => prev.map((x, i) => (i === idx ? { ...x, values: vals } : x)))}
                    />
                    <button
                      type="button"
                      onClick={() => setExtraFilters(prev => prev.filter((_, i) => i !== idx))}
                      title="הסר סינון"
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {extraParamOptions.length > 0 && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) setExtraFilters(prev => [...prev, { key: e.target.value, values: [] }]) }}
                    dir="rtl"
                    className="self-start border border-dashed border-[#1e248c]/40 rounded-lg px-3 py-1.5 text-sm bg-white text-[#1e248c] focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20"
                  >
                    <option value="">בחר פרמטר נוסף לסינון…</option>
                    {extraParamOptions.map(o => <option key={o.value} value={o.value}>{groupLabelHe(o.value)}</option>)}
                  </select>
                )}
              </div>
            </section>

            {/* Recipients */}
            <section>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2">נמענים</p>
              <div className="flex items-center gap-2 flex-wrap border border-gray-200 rounded-xl bg-white p-2 min-h-[44px]">
                {recipients.map(r => (
                  <span key={r.email} className="inline-flex items-center gap-1.5 bg-[#e7eefe] border border-[#c7caea] text-[#1e248c] rounded-full px-2.5 py-1 text-xs font-medium">
                    <span className="w-4 h-4 rounded-full bg-[#1e248c] text-white text-[8px] grid place-items-center">{initials(r.name)}</span>
                    {r.name}
                    <button onClick={() => removeRecipient(r.email)} className="text-[#9094c4] hover:text-red-500"><X size={11} /></button>
                  </span>
                ))}
                <input
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }}
                  placeholder="הוסף נמען / אימייל…"
                  className="flex-1 min-w-[140px] border-none outline-none text-xs bg-transparent text-gray-700"
                />
              </div>
              {membersLoading && (
                <p className="flex items-center gap-2 text-[11px] text-gray-400 mt-2"><Loader2 size={12} className="animate-spin" /> טוען חברי צוות…</p>
              )}
              {!membersLoading && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {suggestions.map(m => (
                    <button key={m.email} onClick={() => addMember(m)}
                      className="inline-flex items-center gap-1.5 border border-dashed border-gray-300 hover:border-[#44b8d3] rounded-full px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 bg-white">
                      <span className="w-4 h-4 rounded-full bg-gray-100 border border-gray-200 text-[8px] grid place-items-center">{initials(m.name)}</span>
                      {m.name}{m.role ? ` · ${m.role}` : ''}
                      <Plus size={11} />
                    </button>
                  ))}
                </div>
              )}
              {!membersLoading && members.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-2">
                  {membersError ? 'לא ניתן לטעון חברי צוות — הוסף נמענים ידנית.' : 'אין חברי צוות מקושרים — הוסף נמענים ידנית.'}
                </p>
              )}
            </section>
          </div>

          {/* ── Live preview pane ── */}
          <div className="lg:sticky lg:top-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
              טיוטה חיה
              <span className="inline-flex items-center gap-1 text-[#44b8d3] normal-case">
                <span className="w-1.5 h-1.5 rounded-full bg-[#44b8d3]" style={{ boxShadow: '0 0 0 3px #e1f2f7' }} /> live
              </span>
            </p>

            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400 min-w-[40px]">אל</span>
                <span className="text-xs font-semibold text-gray-700 truncate">{toLine}</span>
              </div>
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400 min-w-[40px]">נושא</span>
                <span className="text-xs font-semibold text-gray-700 truncate">{subject}</span>
              </div>
              <div className="p-4 flex flex-col gap-3">
                {/* Editable body */}
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  rows={Math.min(10, Math.max(4, bodyText.split('\n').length))}
                  dir="rtl"
                  className="w-full resize-y text-xs text-gray-700 leading-relaxed border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#1e248c]/20 text-right"
                />
                {/* Manual model link — highlighted so it's clear it must be edited */}
                {needsModelLink && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5" dir="rtl">
                    <label className="block text-[11px] font-bold text-amber-800 mb-1">
                      קישור למודל ב-ACC (לעריכה ידנית)
                    </label>
                    <input
                      type="url"
                      value={modelLink}
                      onChange={e => setModelLink(e.target.value)}
                      placeholder="הדבק כאן את הקישור למודל הספציפי ב-ACC"
                      dir="ltr"
                      className="w-full text-xs text-gray-800 bg-white border border-amber-300 rounded-md p-2 text-left focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                    />
                    {!modelLink.trim() && (
                      <p className="text-[10px] text-amber-700 mt-1">
                        הקישור השני בגוף המייל מסומן בצהוב עד שתזינו כתובת.
                      </p>
                    )}
                  </div>
                )}
                {/* Body preview (with links) */}
                <div className="text-[11px] text-gray-500 leading-relaxed flex flex-col gap-1 border-r-2 border-[#e7eefe] pr-2">
                  {segmentBodyText(bodyText, links, resolved.highlightPhrases).map((segs, i) => (
                    <p key={i} className="m-0">
                      {segs.map((s, j) => {
                        if (!s.link) return <span key={j}>{s.text}</span>
                        const style = s.link.highlight ? HIGHLIGHT_PREVIEW : { color: '#1e248c' }
                        if (!s.link.href) return <span key={j} style={style}>{s.text}</span>
                        return <a key={j} href={s.link.href} target="_blank" rel="noreferrer" style={style} className="underline">{s.text}</a>
                      })}
                    </p>
                  ))}
                </div>
                {/* Analytics chart */}
                <div className="rounded-xl border border-gray-100 bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#1e248c]">נושאים לפי {groupLabelHe(groupBy)}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{effectiveIssues.length} נושאים</span>
                  </div>
                  <AnalyticsBars issues={effectiveIssues} groupBy={groupBy} renderName={localizeGroup} />
                </div>
                {/* Screenshot (after analytics) */}
                {template.bodyImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={template.bodyImage} alt="" className="w-full rounded-xl border border-gray-100" />
                )}
                {/* PDF attachment chip (click to review) */}
                <button
                  onClick={handleOpenPdf}
                  disabled={pdfBusy}
                  className="inline-flex items-center gap-3 border border-gray-200 rounded-xl p-2.5 bg-gray-50 max-w-full text-right hover:border-[#44b8d3] transition disabled:opacity-60"
                >
                  <span className="w-9 h-10 rounded grid place-items-center bg-white border border-[#d98a8a] text-[#c0392b] shrink-0">
                    {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  </span>
                  <span className="min-w-0">
                    <b className="block text-xs text-gray-800 truncate">{pdfName}</b>
                    <span className="block text-[11px] text-gray-500 truncate">לחץ לתצוגה · {effectiveIssues.length} נושאים · ~{pdfPages} עמ׳</span>
                  </span>
                  <ExternalLink size={13} className="text-gray-400 shrink-0" />
                </button>
                {/* Excel attachment chip (click to download) */}
                <button
                  onClick={handleOpenXlsx}
                  disabled={xlsxBusy}
                  className="inline-flex items-center gap-3 border border-gray-200 rounded-xl p-2.5 bg-gray-50 max-w-full text-right hover:border-[#1D6F42] transition disabled:opacity-60"
                >
                  <span className="w-9 h-10 rounded grid place-items-center bg-white border border-[#9cc6ab] text-[#1D6F42] shrink-0">
                    {xlsxBusy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                  </span>
                  <span className="min-w-0">
                    <b className="block text-xs text-gray-800 truncate">{xlsxName}</b>
                    <span className="block text-[11px] text-gray-500 truncate">לחץ להורדה · {effectiveIssues.length} נושאים</span>
                  </span>
                  <Download size={13} className="text-gray-400 shrink-0" />
                </button>
              </div>
            </div>

            {/* Action area */}
            <div className="mt-4 flex flex-col gap-2">
              {needsGoogle ? (
                <div className="flex flex-col gap-2 bg-[#fff7ed] border border-[#fed7aa] rounded-xl p-3">
                  <p className="text-xs text-[#9a3412]">כדי ליצור טיוטה ב-Gmail יש לחבר את חשבון ה-Google שלך.</p>
                  <button onClick={connectGoogle} className="self-start inline-flex items-center gap-2 px-4 py-2 bg-[#1e248c] text-white rounded-xl text-sm font-bold hover:bg-[#44b8d3] transition">
                    <Mail size={15} /> חבר חשבון Google
                  </button>
                </div>
              ) : draftUrl ? (
                <div className="flex items-center gap-3">
                  <a href={draftUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e248c] text-white rounded-xl text-sm font-bold hover:bg-[#44b8d3] transition shadow-md">
                    <ExternalLink size={15} /> פתח טיוטה ב-Gmail
                  </a>
                  <span className="text-[11px] text-emerald-600 flex items-center gap-1"><Check size={13} /> הטיוטה נוצרה</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCreateDraft}
                    disabled={creating}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e248c] text-white rounded-xl text-sm font-bold hover:bg-[#44b8d3] transition shadow-md disabled:opacity-60"
                  >
                    {creating ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                    {creating ? 'יוצר טיוטה…' : 'אשר ופתח ב-Gmail'}
                  </button>
                  <span className="text-[11px] text-gray-400">תיווצר טיוטה עם קבצי ה-PDF וה-Excel מצורפים</span>
                </div>
              )}
              {actionError && <p className="text-[11px] text-red-500">{actionError}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hidden snapshot nodes (off-screen, for PNG/PDF rasterization) ── */}
      <div style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1 }} aria-hidden>
        <div ref={emailChartRef} style={{ width: 600, background: '#fff', padding: 12, fontFamily: 'Arial, Assistant, sans-serif' }}>
          <div dir="rtl" style={{ fontSize: 13, fontWeight: 700, color: '#1e248c', marginBottom: 8, textAlign: 'right' }}>
            נושאים לפי {groupLabelHe(groupBy)}
          </div>
          <AnalyticsBars issues={effectiveIssues} groupBy={groupBy} renderName={localizeGroup} width={576} />
        </div>
      </div>
    </div>
  )
}
