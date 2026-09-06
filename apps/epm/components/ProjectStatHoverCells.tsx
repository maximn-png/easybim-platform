'use client'

// Hover panels for the dashboard table's Milestone / Hours percentage cells.
// Hovering a cell shows exactly what the project page shows: the milestone cell
// opens the full MilestoneHistoryPanel (same as the Milestone Status card hover
// and the My Space hover), the hours cell opens the Hours Analytics stat card.
// Data is fetched lazily on first hover and memoized per project for the life
// of the page (the server routes are SWR-cached anyway).

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, Loader2 } from 'lucide-react'
import type { ProjectRow, HoursTeam } from '@/lib/types'
import type { AgendaMilestone } from '@/lib/meTypes'
import MilestoneHistoryPanel from './MilestoneHistoryPanel'
import ProgressBar from './ProgressBar'
import { StatCard, DisciplineBar, CANONICAL_DEFAULT } from './StatCards'

// ── Lazy per-project caches (module scope: survive row re-renders) ──────────

const milestoneCache = new Map<string, Promise<AgendaMilestone[]>>()

interface HoursData {
  modelMgmtSpent: number; superSpent: number; allSpent: number
  modelMgmtBank: number | null; superBank: number | null; totalBudget: number | null
}
const hoursCache = new Map<string, Promise<HoursData>>()

function fetchMilestones(projectId: string): Promise<AgendaMilestone[]> {
  let p = milestoneCache.get(projectId)
  if (!p) {
    p = fetch(`/api/projects/${projectId}/milestones`)
      .then(r => r.json())
      .then((json: { milestones?: AgendaMilestone[] }) => json.milestones ?? [])
    p.catch(() => milestoneCache.delete(projectId))
    milestoneCache.set(projectId, p)
  }
  return p
}

// Same bucketing as the project page's Hours Analytics card: subjects routed
// into the two disciplines via hoursConfig.subjectTeam (canonical defaults).
function fetchHours(project: ProjectRow): Promise<HoursData> {
  let p = hoursCache.get(project._id)
  if (!p) {
    const subjectTeam = project.hoursConfig?.subjectTeam ?? {}
    const teamFor = (subject: string): HoursTeam =>
      subjectTeam[subject] ?? CANONICAL_DEFAULT[subject] ?? 'none'
    p = fetch(`/api/projects/${project._id}/hours-breakdown`)
      .then(r => r.json())
      .then((json: {
        breakdown?: { totalsBySubject?: Record<string, number> }
        banks?: { modelMgmt: number | null; superposition: number | null; total: number | null }
      }) => {
        const totals = json.breakdown?.totalsBySubject ?? {}
        let modelMgmtSpent = 0, superSpent = 0, allSpent = 0
        for (const [subject, h] of Object.entries(totals)) {
          allSpent += h
          const t = teamFor(subject)
          if (t === 'modelMgmt')          modelMgmtSpent += h
          else if (t === 'superposition') superSpent += h
        }
        return {
          modelMgmtSpent, superSpent, allSpent,
          modelMgmtBank: json.banks?.modelMgmt ?? null,
          superBank: json.banks?.superposition ?? null,
          totalBudget: json.banks?.total ?? null,
        }
      })
    p.catch(() => hoursCache.delete(project._id))
    hoursCache.set(project._id, p)
  }
  return p
}

// ── Fixed-position hover anchoring (same clamp as the project page cards) ───

function usePanelAnchor() {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const open = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({
      top: Math.max(12, Math.min(r.top, window.innerHeight - 12 - Math.min(window.innerHeight * 0.7, 520))),
      left: r.right,
    })
  }
  const close = () => setPos(null)
  return { ref, pos, open, close }
}

// Flush to the cell's edge (the offset is padding, not a gap) so the pointer
// can travel into the panel without closing it.
function PanelShell({ pos, width, children, dir }: {
  pos: { top: number; left: number }
  width: string
  children: React.ReactNode
  dir?: 'rtl' | 'ltr'
}) {
  return (
    <div className="fixed z-50 ps-3.5" style={{ top: pos.top, left: pos.left }}>
      <div
        dir={dir}
        className={`${width} max-w-[85vw] max-h-[70vh] overflow-auto rounded-xl bg-white shadow-2xl border border-[#e8eaff]`}
      >
        {children}
      </div>
    </div>
  )
}

// ── Milestone % cell ─────────────────────────────────────────────────────────

export function MilestoneHoverCell({ project }: { project: ProjectRow }) {
  const { ref, pos, open, close } = usePanelAnchor()
  const [bills, setBills] = useState<AgendaMilestone[] | null>(null)
  // This month's bills — what everyone is working on now — get the highlight ring.
  const curMonth = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const onEnter = () => {
    open()
    if (bills === null) fetchMilestones(project._id).then(setBills).catch(() => {})
  }

  return (
    <div ref={ref} onMouseEnter={onEnter} onMouseLeave={close}>
      <ProgressBar value={project.milestoneProgress} neutral />
      {pos && (
        <PanelShell pos={pos} width="w-[420px]" dir="rtl">
          <div className="px-3 py-2">
            {bills === null ? (
              <p className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 size={13} className="animate-spin" /> טוען אבני דרך…
              </p>
            ) : bills.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">אין נתוני אבני דרך לפרויקט זה.</p>
            ) : (
              <MilestoneHistoryPanel
                bills={bills}
                projectName={project.projectName}
                projectNumber={project.projectNumber}
                highlight={(b) => b.date.startsWith(curMonth)}
              />
            )}
          </div>
        </PanelShell>
      )}
    </div>
  )
}

// ── Hours % cell ─────────────────────────────────────────────────────────────

export function HoursHoverCell({ project }: { project: ProjectRow }) {
  const router = useRouter()
  const { ref, pos, open, close } = usePanelAnchor()
  const [hours, setHours] = useState<HoursData | null>(null)

  const onEnter = () => {
    open()
    if (hours === null) fetchHours(project).then(setHours).catch(() => {})
  }

  // Headline = all logged hours vs the total budget — same math as the project
  // page card, so the hover matches it exactly.
  const liveSpent = hours ? hours.allSpent : 0
  const liveBank  = hours ? (hours.totalBudget ?? 0) : 0
  const headlinePct = hours && liveBank > 0 ? Math.round((liveSpent / liveBank) * 100) : null
  const hoursLeft = liveBank - liveSpent

  return (
    <div ref={ref} onMouseEnter={onEnter} onMouseLeave={close}>
      <ProgressBar value={project.hoursProgress} />
      {pos && (
        <PanelShell pos={pos} width="w-[300px]">
          {hours === null ? (
            <p className="flex items-center gap-2 text-xs text-gray-400 px-3 py-3">
              <Loader2 size={13} className="animate-spin" /> Loading hours…
            </p>
          ) : (
            <StatCard
              title="Hours Analytics"
              icon={<BarChart2 size={14} className="text-[#44b8d3]" />}
              ringValue={headlinePct}
              ringCaption="Overall"
              onClick={() => router.push(`/dashboard/${project._id}/hours`)}
              thru="Click to view full analytics →"
              bars={
                <>
                  <DisciplineBar label="MEP Coordination" spent={hours.superSpent} bank={hours.superBank} totalBudget={hours.totalBudget} color="#44b8d3" />
                  <DisciplineBar label="BIM Management" spent={hours.modelMgmtSpent} bank={hours.modelMgmtBank} totalBudget={hours.totalBudget} color="#1e248c" />
                </>
              }
              footLeft={{
                label: 'Spent vs Budget',
                value: `${Math.round(liveSpent).toLocaleString()} / ${Math.round(liveBank).toLocaleString()} hrs`,
              }}
              footRight={{
                label: hoursLeft >= 0 ? 'Hours Left' : 'Over Budget',
                value: hoursLeft >= 0
                  ? `${Math.round(hoursLeft).toLocaleString()} hrs`
                  : `${Math.round(Math.abs(hoursLeft)).toLocaleString()} hrs over`,
                tone: hoursLeft >= 0 ? 'good' : 'bad',
              }}
            />
          )}
        </PanelShell>
      )}
    </div>
  )
}
