'use client'

import type { ReactNode } from 'react'
import type { HoursTeam } from '@/lib/types'

/* The stat-card anatomy shared by the project page's rail (Milestone Status /
   Hours Analytics) and the dashboard table's hover panels, so the hover shows
   exactly the card the project page shows. */

// Canonical subjects default to their namesake team; everything else to 'none'
// until assigned on the Hours Analytics page. Mirrors HoursAnalyticsClient.
export const CANONICAL_DEFAULT: Record<string, HoursTeam> = {
  'Model MGMT':    'modelMgmt',
  'Superposition': 'superposition',
}

// Bar color per milestone discipline; anything unmapped falls back to the accent.
export const MILESTONE_DISCIPLINE_COLOR: Record<string, string> = {
  bimManagement:   '#1e248c',
  mepCoordination: '#44b8d3',
  maximBain:       '#f59e0b',
}

// Shared by Milestone Status and Hours Analytics so the two cards can't drift.
export function ProgressRing({ value, size = 68 }: { value: number; size?: number }) {
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
export function StatCard({
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

export function DisciplineBar({ label, spent, bank, totalBudget = null, color }: { label: string; spent: number; bank: number | null; totalBudget?: number | null; color: string }) {
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
