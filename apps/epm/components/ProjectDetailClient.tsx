'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronRight,
  Users,
  BarChart2,
  CheckCircle2,
  Loader2,
  MessageSquare,
  ExternalLink,
  Search,
  X,
  CornerDownRight,
} from 'lucide-react'
import type { ProjectRow, ReportListItem, HoursTeam } from '@/lib/types'
import StatusBadge from './StatusBadge'
import ProjectLinksBar from './ProjectLinksBar'
import TeamMemberCell from './TeamMemberCell'
import FormaConnectPanel from './FormaConnectPanel'
import ActivityReportsPanel from './reports/ActivityReportsPanel'
import CombinedModelViewer from './ana/CombinedModelViewer'
import CoordinationModelViewer from './CoordinationModelViewer'

// Canonical subjects default to their namesake team; everything else to 'none'
// until assigned on the Hours Analytics page. Mirrors HoursAnalyticsClient.
const CANONICAL_DEFAULT: Record<string, HoursTeam> = {
  'Model MGMT':    'modelMgmt',
  'Superposition': 'superposition',
}

// Bar color per milestone discipline; anything unmapped falls back to the accent.
const MILESTONE_DISCIPLINE_COLOR: Record<string, string> = {
  bimManagement:   '#1e248c',
  mepCoordination: '#44b8d3',
  maximBain:       '#f59e0b',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Breadcrumb({ projectName, anaView = false }: { projectName: string; anaView?: boolean }) {
  if (anaView) {
    return (
      <nav className="flex items-center gap-1 text-xs text-gray-500">
        <Link href="/ana" className="hover:text-[#1e248c] transition-colors">ANA Projects</Link>
        <ChevronRight size={12} />
        <span className="text-[#1e248c] font-medium" dir="rtl">{projectName}</span>
      </nav>
    )
  }
  // No bottom margin: the header band spaces its rows with `gap`.
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500">
      <Link href="/dashboard" className="hover:text-[#1e248c] transition-colors">Dashboard</Link>
      <ChevronRight size={12} />
      <Link href="/dashboard" className="hover:text-[#1e248c] transition-colors">EPM</Link>
      <ChevronRight size={12} />
      <span className="text-[#1e248c] font-medium" dir="rtl">{projectName}</span>
    </nav>
  )
}

// ACC model viewers (ANA client view only) — live Autodesk Viewer. The card
// itself is title-less; the viewer renders its own "3D Models" / "2D Drawings"
// plus a left sidebar (model list + the passed-in forms/reports).
function CombinedModelCard({ projectId, formsPanel, activityPanel }: { projectId: string; formsPanel?: ReactNode; activityPanel?: ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <CombinedModelViewer projectId={projectId} formsPanel={formsPanel} activityPanel={activityPanel} />
    </div>
  )
}

// Shared by Milestone Status and Hours Analytics so the two cards can't drift.
function ProgressRing({ value, size = 68 }: { value: number; size?: number }) {
  const stroke = size / 9.7          // 7 at 68px, 10 at 96px
  const r = (size - stroke) / 2 - 1
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(100, Math.max(0, value)) / 100)
  const c = size / 2
  return (
    <svg className="epm-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#e7eefe" strokeWidth={stroke} />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke="#1e248c" strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text x={c} y={c + size * 0.068} textAnchor="middle" fontSize={size * 0.206} fontWeight="700" fill="#1e248c">
        {value}%
      </text>
    </svg>
  )
}

// One anatomy for both rail stat cards: title · discipline bars + overall ring
// · two-stat footer. Passing the pieces in (rather than duplicating markup)
// keeps Milestone and Hours looking alike by construction.
function StatCard({
  title, icon, bars, ringValue, ringCaption, footLeft, footRight, thru, onClick, emptyLabel,
}: {
  title: string
  icon: ReactNode
  bars: ReactNode
  ringValue: number | null
  ringCaption: string
  footLeft: { label: string; value: string; tone?: 'default' | 'good' | 'bad' }
  footRight: { label: string; value: string; tone?: 'default' | 'good' | 'bad' }
  /** Caption hinting the card links onward (Hours only). */
  thru?: string
  onClick?: () => void
  /** Shown instead of bars/ring/footer when there is no data at all. */
  emptyLabel?: string
}) {
  const toneCls = (t?: 'default' | 'good' | 'bad') =>
    t === 'good' ? 'text-green-600' : t === 'bad' ? 'text-red-500' : 'text-[#1e248c]'

  return (
    <div
      className={`glass-card rounded-2xl p-[15px] flex flex-col gap-3 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
      onClick={onClick}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter') onClick() } : undefined}
    >
      <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2">
        {icon} {title}
      </h2>

      {emptyLabel ? (
        <div className="flex-1 flex items-center justify-center py-6">
          <p className="text-xs text-gray-400">{emptyLabel}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-2.5">{bars}</div>
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              {ringValue != null ? <ProgressRing value={ringValue} /> : <div className="epm-ring w-[68px] h-[68px] rounded-full border-[7px] border-[#e7eefe]" />}
              <p className="epm-ring-cap text-[9px] text-gray-400">{ringCaption}</p>
            </div>
          </div>

          <div className="flex justify-between gap-2.5 pt-2 border-t border-gray-100 text-[11px]">
            <div>
              <p className="text-gray-400">{footLeft.label}</p>
              <p className={`font-semibold tabular-nums ${toneCls(footLeft.tone)}`}>{footLeft.value}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400">{footRight.label}</p>
              <p className={`font-semibold tabular-nums ${toneCls(footRight.tone)}`}>{footRight.value}</p>
            </div>
          </div>

          {thru && <p className="epm-thru text-[9.5px] text-gray-400">{thru}</p>}
        </>
      )}
    </div>
  )
}

function DisciplineBar({ label, spent, bank, totalBudget = null, color }: { label: string; spent: number; bank: number | null; totalBudget?: number | null; color: string }) {
  // Use the discipline's own bank when set; otherwise (the project has only a total
  // budget, no per-discipline price breakdown) fall back to the total budget so the
  // bar still shows a percentage rather than a bare hours count.
  const denom = bank != null && bank > 0 ? bank : (spent > 0 ? totalBudget : null)
  // pct may exceed 100 (over bank) — show the true % but clamp the bar fill.
  const pct = denom != null && denom > 0 ? Math.round((spent / denom) * 100) : null
  const fill = Math.min(100, Math.max(0, pct ?? 0))
  // %, when a denominator exists; bare hours only if there's no budget at all; else —.
  const display = pct !== null ? `${pct}%` : spent > 0 ? `${Math.round(spent).toLocaleString()} hrs` : '—'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline gap-2 text-[11px]">
        <span className="text-gray-600 truncate">{label}</span>
        <span className="font-semibold text-[#1e248c] tabular-nums">{display}</span>
      </div>
      <div className="h-[7px] rounded-full bg-[#e7eefe] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${fill}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

// Short relative time for the activity list (he-IL).
function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'הרגע'
  if (m < 60) return `לפני ${m} דק׳`
  const h = Math.round(m / 60)
  if (h < 24) return `לפני ${h} שע׳`
  const d = Math.round(h / 24)
  if (d < 30) return `לפני ${d} ימים`
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Monday combined-updates feed (served by /api/projects/[id]/updates) ──────

interface MondayUpdateCreator { id: string | null; name: string | null; photo: string | null }
interface MondayUpdateItem {
  id:        string
  body:      string
  textBody:  string
  createdAt: string
  creator:   MondayUpdateCreator
  replies:   Array<{ id: string; body: string; textBody: string; createdAt: string; creator: MondayUpdateCreator }>
  assets:    Array<{ id: string; name: string; url: string | null; isImage: boolean }>
  source:    { kind: 'project-board' | 'milestone' | 'master' | 'doc'; label: string; itemName: string; itemUrl: string | null }
}

// Hebrew source badge, color-coded per board so a mixed feed stays scannable.
const SOURCE_BADGE: Record<MondayUpdateItem['source']['kind'], { label: string; cls: string }> = {
  'project-board': { label: 'לוח הפרויקט', cls: 'bg-[#e7eefe] text-[#1e248c]' },
  'milestone':     { label: 'אבני דרך',    cls: 'bg-cyan-50 text-cyan-700' },
  'master':        { label: 'לוח ראשי',    cls: 'bg-amber-50 text-amber-700' },
  'doc':           { label: 'מסמך',        cls: 'bg-violet-50 text-violet-700' },
}

// Above this much text an update is collapsed behind "עוד" in the card grid.
// Measured on textBody so the threshold is independent of Monday's markup.
const CLAMP_CHARS = 220

function Avatar({ name, photo, small = false }: { name: string | null; photo: string | null; small?: boolean }) {
  const size = small ? 'w-[22px] h-[22px] text-[8.5px]' : 'w-7 h-7 text-[10px]'
  const initials =
    (name ?? '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name ?? ''} className={`${size} rounded-full object-cover shrink-0`} />
  }
  return (
    <div className={`${size} rounded-full bg-[#e7eefe] text-[#1e248c] font-semibold flex items-center justify-center shrink-0`}>
      {initials}
    </div>
  )
}

// Render Monday's HTML update `body` faithfully (tables, lists, links, @mentions,
// styled paragraphs) by SANITIZING it and injecting it, so real <table> markup
// renders natively — a hand-rolled walker can't reproduce Monday's structure.
// Sanitizing strips the XSS vectors: script/style/iframe/embed, on* handlers,
// javascript: URLs, and auth-gated <img> (images are shown from `assets` instead).
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'img', 'form', 'input'])

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined' || !window.DOMParser) return ''
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return ''
  }
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase()
      if (DROP_TAGS.has(tag)) { child.remove(); continue }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        const val  = attr.value
        if (name.startsWith('on')) child.removeAttribute(attr.name)
        else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(val)) child.removeAttribute(attr.name)
        else if (name === 'style' && /(expression|javascript:)/i.test(val)) child.removeAttribute(attr.name)
      }
      if (tag === 'a') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer') }
      walk(child)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

// Monday checklists arrive as an EMPTY <ul data-checklist-holder> in the HTML
// body (their items are loaded dynamically on monday.com) while text_body DOES
// carry the lines — so when the HTML's visible text is much shorter than the
// plain text, the plain text is the truthful render.
function visibleTextLen(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/[﻿​]/g, '').trim().length
}
function preferPlainText(body: string | undefined, textBody: string): boolean {
  const t = textBody.trim().length
  if (!body?.trim() || t === 0) return false
  return visibleTextLen(body) < t * 0.5
}

function RichText({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html])
  // Fallback before hydration / if DOMParser is unavailable: tags stripped to text.
  if (!clean) return <span className="text-[11.5px] text-gray-700 whitespace-pre-wrap break-words">{html.replace(/<[^>]+>/g, ' ').replace(/﻿/g, '').trim()}</span>
  return <div className="monday-body text-[11.5px] text-gray-700 leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: clean }} />
}

export default function ProjectDetailClient({
  project,
  reports: initialReports = [],
  anaView = false,
}: {
  project: ProjectRow
  // Only the ANA client view renders report history inline; the internal EPM
  // page reaches it through the Forma button (→ the Reports page).
  reports?: ReportListItem[]
  // Client-facing ANA view: ANA number instead of the EasyBIM number, no status
  // badge, ACC-only links, a Combined Model card, read-only reports (no delete),
  // and no internal Milestone / Hours / Contacts panels.
  anaView?: boolean
}) {
  const router = useRouter()

  // Report history (ANA view only; mutated locally on delete inside the panel).
  const [reports, setReports] = useState<ReportListItem[]>(initialReports)

  // True when the project's hub has no viewer credentials — the center model
  // column is absent and the updates card takes its width instead.
  const [viewerHidden, setViewerHidden] = useState(false)

  // Milestone completion, computed during sync from MI-001-MilestonesProjects.
  // Disciplines are dynamic per project (most have BIM Management + MEP
  // Coordination; a few also have Maxim/Bain). overallMilestone is the pooled
  // completed/total across all bills.
  const milestoneDisciplines = project.milestoneDisciplines ?? []
  const overallMilestone = project.milestoneProgress
  const hasMilestones = overallMilestone != null
  // Footer figures for the Milestone card, pooled from the same per-discipline
  // counts that produce overallMilestone.
  const billsDone  = milestoneDisciplines.reduce((n, d) => n + d.completed, 0)
  const billsTotal = milestoneDisciplines.reduce((n, d) => n + d.total, 0)

  // Live hours from the same source as the Hours Analytics page (Monday), so the
  // card reflects edits immediately rather than the cached snapshot.actualHours
  // (which only refreshes when the updateHours job re-runs). Subjects are routed
  // into the two disciplines via the per-project map set on the Hours Analytics
  // page (hoursConfig.subjectTeam); the headline uses ALL logged hours vs the
  // total budget, so it matches the dashboard %.
  const subjectTeam = project.hoursConfig?.subjectTeam ?? {}
  const teamFor = (subject: string): HoursTeam =>
    subjectTeam[subject] ?? CANONICAL_DEFAULT[subject] ?? 'none'

  const [hours, setHours] = useState<{
    modelMgmtSpent: number; superSpent: number; allSpent: number
    modelMgmtBank: number | null; superBank: number | null; totalBudget: number | null
  } | null>(null)
  useEffect(() => {
    if (anaView) return   // Hours are internal-only — never fetched in the ANA view.
    let alive = true
    fetch(`/api/projects/${project._id}/hours-breakdown`)
      .then(r => r.json())
      .then((json: {
        breakdown?: { totalsBySubject?: Record<string, number> }
        banks?: { modelMgmt: number | null; superposition: number | null; total: number | null }
      }) => {
        if (!alive) return
        const totals = json.breakdown?.totalsBySubject ?? {}
        let modelMgmtSpent = 0, superSpent = 0, allSpent = 0
        for (const [subject, h] of Object.entries(totals)) {
          allSpent += h
          const t = teamFor(subject)
          if (t === 'modelMgmt')          modelMgmtSpent += h
          else if (t === 'superposition') superSpent += h
        }
        setHours({
          modelMgmtSpent, superSpent, allSpent,
          modelMgmtBank: json.banks?.modelMgmt ?? null,
          superBank: json.banks?.superposition ?? null,
          totalBudget: json.banks?.total ?? null,
        })
      })
      .catch(() => { /* leave null → shows — */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project._id])

  // Combined Monday updates feed (live, internal-only — like hours). The server
  // caches responses (5 min), so a revisit repaints the feed immediately.
  const [mondayUpdates, setMondayUpdates] = useState<MondayUpdateItem[] | null>(null)
  useEffect(() => {
    if (anaView) return
    let alive = true
    fetch(`/api/projects/${project._id}/updates`)
      .then(r => r.json())
      .then((json: { updates?: MondayUpdateItem[] }) => {
        if (!alive) return
        setMondayUpdates(json.updates ?? [])
      })
      .catch(() => { if (alive) setMondayUpdates([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project._id])

  // Source filter (by board): default "all"; clicking a chip ISOLATES that board.
  // Clicking the active chip again (or "All") returns to the full feed.
  type UpdateKind = MondayUpdateItem['source']['kind']
  const [activeFilter, setActiveFilter] = useState<'all' | UpdateKind>('all')
  const kindCounts = useMemo(() => {
    const m: Record<UpdateKind, number> = { 'project-board': 0, milestone: 0, master: 0, doc: 0 }
    for (const u of mondayUpdates ?? []) m[u.source.kind]++
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mondayUpdates])
  const presentKinds = (['project-board', 'milestone', 'master', 'doc'] as UpdateKind[]).filter(k => kindCounts[k] > 0)
  const kindChipLabel: Record<UpdateKind, string> = {
    'project-board': project.projectNumber,   // e.g. "22125"
    milestone:       'MI-001',
    master:          'MA-004',
    doc:             'מסמכים',
  }
  // Free-text search: matches the update/reply text, author names and the item name.
  const [updatesQuery, setUpdatesQuery] = useState('')
  const query = updatesQuery.trim().toLowerCase()
  const matchesQuery = (u: MondayUpdateItem) => {
    if (!query) return true
    const hay = [
      u.textBody,
      u.source.itemName,
      u.creator.name ?? '',
      ...u.replies.map(r => `${r.textBody} ${r.creator.name ?? ''}`),
    ].join(' ').toLowerCase()
    return hay.includes(query)
  }
  const visibleUpdates = (mondayUpdates ?? [])
    .filter(u => activeFilter === 'all' || u.source.kind === activeFilter)
    .filter(matchesQuery)

  // Per-card disclosure in the columnised feed: long bodies collapse to ~8 lines
  // and reply threads hide behind their count, so a card stays scannable.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [threadOpen, setThreadOpen] = useState<Set<string>>(new Set())
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  // Headline = all logged hours vs the total budget (שכט סופי ÷ 300).
  const liveSpent = hours ? hours.allSpent : 0
  const liveBank  = hours ? (hours.totalBudget ?? 0) : 0
  const headlinePct = hours && liveBank > 0 ? Math.round((liveSpent / liveBank) * 100) : null
  const hoursLeft = liveBank - liveSpent // signed: negative = over budget

  // ── ANA client view ──────────────────────────────────────────────────────
  if (anaView) {
    const formaPanel = (
      <FormaConnectPanel
        projectId={project._id}
        projectNumber={project.projectNumber}
        accProjectId={project.accProjectId}
        accUrl={project.links.acc}
        accExternalHub={project.accExternalHub}
        partnerHubName={project.accHubName}
        partnerHubKey={project.accHubKey}
        basePath="/ana"
      />
    )
    const activityCard = (
      <ActivityReportsPanel
        projectId={project._id}
        reports={reports}
        onDeleted={id => setReports(prev => prev.filter(r => r._id !== id))}
        anaView
        variant="card"
      />
    )
    return (
      <div
        className="min-h-[calc(100vh-4rem)]"
        style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
      >
        <div className="px-6 py-3">
          <div className="min-w-0 flex flex-col gap-2.5">
            {/* Compact single-row header: breadcrumb left, number+name+links right. */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Breadcrumb projectName={project.projectName} anaView />
              {/* One clean row: ACC pill · number · project name (rightmost). */}
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <ProjectLinksBar project={project} anaView />
                <span className="text-sm font-mono text-[#44b8d3] tracking-widest">
                  {project.ana?.number || '—'}
                </span>
                <h1 className="text-xl font-bold text-[#1e248c] leading-tight" dir="rtl">
                  {project.projectName}
                </h1>
              </div>
            </div>

            {/* Big viewers with a left sidebar (models list, forms, reports). */}
            <CombinedModelCard
              projectId={project._id}
              formsPanel={formaPanel}
              activityPanel={activityCard}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Internal EPM view — one screen, three columns: stat rail · model viewer
  //    (center) · updates (right). Only the updates feed and the rail scroll,
  //    internally; the page itself is locked to the viewport from lg up
  //    (`epm-one-screen`, see globals.css). Below lg it stacks and scrolls. ──
  return (
    <div
      className="epm-one-screen flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      {/* Full-bleed padding, matching the Projects page (was max-w-[1400px]). */}
      <div className="flex flex-col gap-3.5 px-6 lg:px-10 py-5 lg:flex-1 lg:min-h-0">

        {/* ── Header band: breadcrumb, then identity · links · status · Forma ── */}
        <div className="shrink-0 flex flex-col gap-2">
          <Breadcrumb projectName={project.projectName} />
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs font-mono text-[#44b8d3] uppercase tracking-widest">{project.projectNumber}</p>
            <h1 className="text-2xl font-bold text-[#1e248c] leading-tight" dir="rtl">
              {project.projectName}
            </h1>
            <ProjectLinksBar project={project} />
            <div className="flex-1 min-w-[2rem]" />
            <StatusBadge status={project.status} />
            {/* Forms & Actions, collapsed to a button + config popover. */}
            <FormaConnectPanel
              projectId={project._id}
              projectNumber={project.projectNumber}
              accProjectId={project.accProjectId}
              accUrl={project.links.acc}
              accExternalHub={project.accExternalHub}
              partnerHubName={project.accHubName}
              partnerHubKey={project.accHubKey}
              variant="button"
            />
          </div>
        </div>

        {/* ── Body: stat rail · model viewer (center) · updates (right) ── */}
        <div className="flex flex-col lg:flex-row gap-3.5 lg:flex-1 lg:min-h-0">

          <div className="epm-rail flex flex-col gap-3.5 lg:w-72 lg:shrink-0 lg:min-h-0 lg:overflow-y-auto">

            {/* Milestone Status — % of bills completed, per discipline + overall */}
            <StatCard
              title="Milestone Status"
              icon={<CheckCircle2 size={14} className="text-[#44b8d3]" />}
              ringValue={overallMilestone}
              ringCaption="Overall"
              emptyLabel={hasMilestones ? undefined : 'No milestone data'}
              bars={
                milestoneDisciplines.length > 0 ? (
                  milestoneDisciplines.map(d => (
                    <DisciplineBar
                      key={d.key}
                      label={d.label}
                      spent={d.progress}
                      bank={100}
                      color={MILESTONE_DISCIPLINE_COLOR[d.key] ?? '#44b8d3'}
                    />
                  ))
                ) : (
                  <p className="text-xs text-gray-400">No discipline breakdown</p>
                )
              }
              footLeft={{ label: 'Bills Completed', value: billsTotal > 0 ? `${billsDone} / ${billsTotal}` : '—' }}
              footRight={{ label: 'Remaining', value: billsTotal > 0 ? `${billsTotal - billsDone} bills` : '—' }}
            />

            {/* Hours Analytics — same anatomy, links through to the full page */}
            <StatCard
              title="Hours Analytics"
              icon={<BarChart2 size={14} className="text-[#44b8d3]" />}
              ringValue={headlinePct}
              ringCaption="Overall"
              onClick={() => router.push(`/dashboard/${project._id}/hours`)}
              thru="Click to view full analytics →"
              bars={
                <>
                  {/* MEP first, matching the order milestoneDisciplines returns,
                      so the same label sits on the same line in both cards. */}
                  <DisciplineBar label="MEP Coordination" spent={hours?.superSpent ?? 0} bank={hours?.superBank ?? null} totalBudget={hours?.totalBudget ?? null} color="#44b8d3" />
                  <DisciplineBar label="BIM Management" spent={hours?.modelMgmtSpent ?? 0} bank={hours?.modelMgmtBank ?? null} totalBudget={hours?.totalBudget ?? null} color="#1e248c" />
                </>
              }
              footLeft={{
                label: 'Spent vs Budget',
                value: hours ? `${Math.round(liveSpent).toLocaleString()} / ${Math.round(liveBank).toLocaleString()} hrs` : '—',
              }}
              footRight={{
                label: hoursLeft >= 0 ? 'Hours Left' : 'Over Budget',
                value: !hours
                  ? '—'
                  : hoursLeft >= 0
                    ? `${Math.round(hoursLeft).toLocaleString()} hrs`
                    : `${Math.round(Math.abs(hoursLeft)).toLocaleString()} hrs over`,
                tone: !hours ? 'default' : hoursLeft >= 0 ? 'good' : 'bad',
              }}
            />

            {/* Project Contacts — stretches to fill the rest of the rail so its
                bottom edge aligns with the viewer's. */}
            {(project.bimManager || project.mepCoordinator || project.bimModeller) && (
              <div className="glass-card rounded-2xl p-[15px] flex flex-col gap-3 lg:flex-1">
                <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2">
                  <Users size={14} className="text-[#44b8d3]" /> Project Contacts
                </h2>
                <div className="epm-people flex flex-col gap-2">
                  {([
                    [project.bimManager, 'BIM Manager'],
                    [project.mepCoordinator, 'MEP Coordinator'],
                    [project.bimModeller, 'BIM Modeller'],
                  ] as const).map(([member, role]) =>
                    member ? (
                      <div key={role} className="flex items-center gap-2.5">
                        <span className="shrink-0"><TeamMemberCell member={member} /></span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{member.name}</p>
                          <p className="text-[10px] text-gray-400">{role}</p>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Center: the coordination model viewer, filling the column.
                 Hides itself (and lets updates take the width) for hubs
                 without viewer credentials. ── */}
          <CoordinationModelViewer
            projectId={project._id}
            className="lg:flex-1 lg:min-w-0 lg:min-h-0"
            onUnsupported={() => setViewerHidden(true)}
          />

          {/* ── Right: Project Updates — a narrow column; the feed is the only
                 scroller. Takes the center's width too when there's no viewer. ── */}
          <div className={`glass-card rounded-2xl p-[15px] flex flex-col gap-3 @container lg:min-h-0 ${viewerHidden ? 'lg:flex-1 lg:min-w-0' : 'lg:w-[24rem] xl:w-[28rem] lg:shrink-0'}`}>
            <div className="shrink-0 flex items-center gap-2.5 flex-wrap">
              <h2 className="font-semibold text-[#1e248c] text-[13px] flex items-center gap-2">
                <MessageSquare size={14} className="text-[#44b8d3]" /> Project Updates
              </h2>

              <div className="flex items-center gap-1.5 flex-wrap">
                {presentKinds.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveFilter('all')}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                        activeFilter === 'all' ? 'bg-[#1e248c] text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      הכל <span className="opacity-70 tabular-nums">{mondayUpdates?.length ?? 0}</span>
                    </button>
                    {presentKinds.map(k => {
                      const on = activeFilter === k
                      return (
                        <button
                          key={k}
                          onClick={() => setActiveFilter(prev => (prev === k ? 'all' : k))}
                          title={`הצג רק ${kindChipLabel[k]}`}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                            on ? `${SOURCE_BADGE[k].cls} border-transparent ring-1 ring-inset ring-[#1e248c]/20` : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {kindChipLabel[k]} <span className="opacity-60 tabular-nums">{kindCounts[k]}</span>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>

              {/* Search sits inline in the header — that's what bought the
                  vertical room for a no-scroll page. ml-auto, not ms-auto: the
                  wrapper is dir="rtl", so the logical inline-start would resolve
                  to the right and pull it the wrong way. */}
              {mondayUpdates !== null && mondayUpdates.length > 0 && (
                <div dir="rtl" className="relative ml-auto w-full sm:w-52">
                  <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={updatesQuery}
                    onChange={e => setUpdatesQuery(e.target.value)}
                    placeholder="חיפוש בעדכונים…"
                    className="w-full text-[11.5px] rounded-lg border border-gray-200 bg-white/70 py-1.5 pr-8 pl-7 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-[#44b8d3] focus:ring-1 focus:ring-[#44b8d3]/30"
                  />
                  {updatesQuery && (
                    <button
                      onClick={() => setUpdatesQuery('')}
                      title="נקה חיפוש"
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              )}

              {mondayUpdates && (
                <span className="text-[10px] font-mono text-gray-400 tabular-nums">{visibleUpdates.length} עדכונים</span>
              )}
            </div>

            {mondayUpdates === null ? (
              <div className="flex-1 flex items-center justify-center py-8 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : visibleUpdates.length === 0 ? (
              <p dir="rtl" className="text-xs text-gray-400 py-4">
                {(mondayUpdates?.length ?? 0) === 0
                  ? 'אין עדכונים מ-Monday לפרויקט זה.'
                  : query
                    ? `לא נמצאו עדכונים התואמים ל"${updatesQuery.trim()}".`
                    : 'אין עדכונים למקורות שנבחרו.'}
              </p>
            ) : (
              // The one scroll container on the page. Columns come from the
              // card's own width (@container) — the narrow right column renders
              // a single column; without a viewer it widens and re-columnises.
              <div className="lg:flex-1 lg:min-h-0 overflow-y-auto pr-1 max-h-[60vh] lg:max-h-none grid grid-cols-1 @min-[720px]:grid-cols-2 @min-[1180px]:grid-cols-3 gap-2.5 content-start">
                {visibleUpdates.map(u => {
                  const badge  = SOURCE_BADGE[u.source.kind] ?? { label: u.source.label, cls: 'bg-gray-100 text-gray-600' }
                  const images = u.assets.filter(a => a.isImage && a.url)
                  // Clamp on text length, but also on block markup Monday emits
                  // (tables/lists) — those render tall from very little text.
                  const long   = u.textBody.length > CLAMP_CHARS || /<(table|ul|ol|blockquote)\b/i.test(u.body ?? '')
                  const open   = expanded.has(u.id)
                  const thread = threadOpen.has(u.id)
                  return (
                    <div
                      key={u.id}
                      dir="rtl"
                      className="flex gap-2.5 rounded-xl border border-[#1e248c]/[0.07] bg-white/70 p-2.5"
                    >
                      <Avatar name={u.creator.name} photo={u.creator.photo} />
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11.5px] font-semibold text-gray-800">{u.creator.name ?? 'לא ידוע'}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full ${badge.cls}`}>{badge.label}</span>
                          <span className="text-[10px] text-gray-400">{timeAgo(u.createdAt)}</span>
                        </div>
                        <p className="text-[10.5px] text-gray-500 truncate">{u.source.itemName}</p>

                        {/* Collapsed to a fixed height with a fade — robust with
                            Monday's arbitrary markup (tables included). */}
                        {(u.body?.trim() || u.textBody) && (
                          <div className={`relative mt-1 ${long && !open ? 'max-h-[8.5rem] overflow-hidden' : ''}`}>
                            {u.body?.trim() && !preferPlainText(u.body, u.textBody)
                              ? <RichText html={u.body} />
                              : <p className="text-[11.5px] text-gray-700 whitespace-pre-wrap break-words">{u.textBody}</p>}
                            {long && !open && (
                              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white/90 to-transparent pointer-events-none" />
                            )}
                          </div>
                        )}

                        {images.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {images.map(a => (
                              <a key={a.id} href={a.url!} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={a.url!} alt={a.name} className="h-14 w-auto rounded-lg border border-gray-200 object-cover" />
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2.5 flex-wrap mt-1.5">
                          {long && (
                            <button
                              onClick={() => setExpanded(prev => toggle(prev, u.id))}
                              className="text-[10.5px] font-semibold text-[#1e248c] hover:underline"
                            >
                              {open ? 'פחות' : 'עוד'}
                            </button>
                          )}
                          {u.replies.length > 0 && (
                            <button
                              onClick={() => setThreadOpen(prev => toggle(prev, u.id))}
                              className="inline-flex items-center gap-1 text-[10.5px] text-gray-500 hover:text-[#1e248c]"
                            >
                              <CornerDownRight size={11} /> {u.replies.length} תגובות
                            </button>
                          )}
                          {u.source.itemUrl && (
                            <a
                              href={u.source.itemUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-[#44b8d3] hover:underline"
                            >
                              <ExternalLink size={10} /> Monday
                            </a>
                          )}
                        </div>

                        {thread && u.replies.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2 border-r-2 border-gray-100 pr-2.5">
                            {u.replies.map(r => (
                              <div key={r.id} className="flex items-start gap-2">
                                <Avatar name={r.creator.name} photo={r.creator.photo} small />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10.5px] font-semibold text-gray-700">{r.creator.name ?? 'לא ידוע'}</span>
                                    <span className="text-[9px] text-gray-400">{timeAgo(r.createdAt)}</span>
                                  </div>
                                  {r.body?.trim() && !preferPlainText(r.body, r.textBody) ? (
                                    <div className="mt-0.5"><RichText html={r.body} /></div>
                                  ) : r.textBody ? (
                                    <p className="text-[11px] text-gray-600 whitespace-pre-wrap break-words">{r.textBody}</p>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
