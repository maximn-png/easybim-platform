'use client'

import type { AgendaMilestone } from '@/lib/meTypes'

/* The "כל אבני הדרך" panel: every milestone of a project with its bills nested
   beneath, each bill a team-colored row (avatars · name · date · status chip).
   Shared by the My Space milestones hover and the project page's Milestone
   Status hover so the two can't drift apart. */

export const fmtDay = (date: string) =>
  date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '—'

// The MI-001 צוות label colors, exactly as on the board.
const TEAM_COLORS: Record<string, string> = {
  'תיאום מערכות': '#4eccc6',
  'ניהול מודל': '#579bfc',
  'מקסים/באין': '#757575',
  'מקסים+באין': '#333333',
}
export const teamColor = (team: string) => TEAM_COLORS[team.trim()] ?? '#c4c4c4'

// Monday's own label colors, so chips here look exactly like the board.
const MONDAY_STATUS_COLORS: Record<string, string> = {
  'submitted': '#00c875',
  'done': '#00c875',
  'work completed': '#9d50dd',
  'working on it': '#fdab3d',
  'future steps': '#216edf',
  'rejected': '#df2f4a',
  'stuck': '#df2f4a',
  '?': '#faa1f1',
}
export const statusColor = (s: string | null) => MONDAY_STATUS_COLORS[(s ?? '').trim().toLowerCase()] ?? '#c4c4c4'

// Monday profile photos of a bill's employees (stacked, max 3).
export function BillAvatars({ employees, size = 16 }: { employees: Array<{ id: string; name: string; avatarUrl?: string }>; size?: number }) {
  if (!employees.length) return null
  return (
    <span className="inline-flex shrink-0 -space-x-1 rtl:space-x-reverse align-middle">
      {employees.slice(0, 3).map((e) =>
        e.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={e.id} src={e.avatarUrl} alt={e.name} title={e.name}
            className="rounded-full object-cover border border-white" style={{ width: size, height: size }} />
        ) : (
          <span key={e.id} title={e.name}
            className="rounded-full bg-[#e8eaff] text-[#1e248c] text-[7px] font-bold flex items-center justify-center border border-white"
            style={{ width: size, height: size }}>
            {(e.name || '?').slice(0, 1)}
          </span>
        )
      )}
    </span>
  )
}

export function StatusChip({ status, small }: { status: string | null; small?: boolean }) {
  return (
    <span
      className={`shrink-0 font-semibold rounded text-white text-center ${small ? 'text-[8px] px-1 py-px min-w-[52px]' : 'text-[9px] px-1.5 py-0.5 min-w-[64px]'}`}
      style={{ background: statusColor(status) }}
    >
      {status || '—'}
    </span>
  )
}

export default function MilestoneHistoryPanel({
  bills, projectName, projectNumber, highlight, arrow = false,
}: {
  bills: AgendaMilestone[]
  projectName: string
  projectNumber: string
  /** Which bills get the emphasis ring — My Space passes "the hovered bill", the project page passes "due this month". */
  highlight?: (b: AgendaMilestone) => boolean
  /** Append the ← marker to highlighted bill names (My Space style). */
  arrow?: boolean
}) {
  const groups = new Map<string, AgendaMilestone[]>()
  for (const h of bills) {
    const list = groups.get(h.milestoneName) ?? []
    list.push(h)
    groups.set(h.milestoneName, list)
  }
  return (
    <>
      <div className="text-[10px] font-bold text-[#1e248c] border-b border-[#eef0fb] pb-1 mb-1">
        כל אבני הדרך · {projectName} <span className="font-mono text-[9px] text-[#44b8d3]" dir="ltr">{projectNumber}</span>
      </div>
      {[...groups.entries()].map(([name, rows], gi) => (
        <div key={gi} className="mb-1 last:mb-0">
          <div className="text-[10px] font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">{name}</div>
          {/* A milestone with no bills yet arrives as one placeholder row (billId '') —
              its group header above is the whole story. */}
          {rows.filter((h) => h.billId).map((h, j) => {
            const hot = highlight?.(h) ?? false
            return (
              <div
                key={j}
                onClick={h.url ? () => window.open(h.url, '_blank', 'noopener') : undefined}
                className={`flex items-center gap-2 py-0.5 ps-1.5 pe-1 ms-3 mt-0.5 rounded-md border-e-4 ${hot ? 'ring-1 ring-[#1e248c]' : ''} ${h.url ? 'cursor-pointer hover:brightness-95' : ''}`}
                style={{ background: `${teamColor(h.team)}26`, borderColor: teamColor(h.team) }}
                title={h.url ? `${h.team ? `${h.team} · ` : ''}פתיחת החשבון במאנדיי` : h.team || undefined}
              >
                <BillAvatars employees={h.employees} size={14} />
                <span className={`flex-1 min-w-0 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis ${hot ? 'font-bold text-[#1e248c]' : 'text-gray-700'}`}>
                  {h.billName}{hot && arrow ? ' ←' : ''}
                </span>
                <span dir="ltr" className="shrink-0 text-[9px] text-gray-500 tabular-nums">{fmtDay(h.date)}</span>
                <StatusChip status={h.status} small />
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
