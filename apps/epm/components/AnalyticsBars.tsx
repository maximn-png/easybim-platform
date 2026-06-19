'use client'

// Inline-styled "Issues by <groupBy>" status-stacked bars. Used in the modal
// preview, the hidden email-chart snapshot, and the report PDF. Uses ONLY hex
// inline styles (no Tailwind classes) so html-to-image can rasterize it — Tailwind
// v4 emits oklch() colors which break canvas serialization.
import { useMemo } from 'react'
import type { AccIssue } from '@/lib/services/apsService'
import { type GroupKey, groupValue, statusColor, statusLabel, segmentTextColor } from '@/lib/reportGrouping'

export default function AnalyticsBars({
  issues, groupBy, maxRows = 8, renderName, width,
}: {
  issues: AccIssue[]
  groupBy: GroupKey
  maxRows?: number
  renderName?: (n: string) => string
  width?: number
}) {
  const { groups, statuses, maxTotal } = useMemo(() => {
    const map = new Map<string, AccIssue[]>()
    for (const i of issues) {
      const key = groupValue(i, groupBy)
      map.set(key, [...(map.get(key) ?? []), i])
    }
    const groups = [...map.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, maxRows)
    const statuses = [...new Set(issues.map(i => i.status))].filter(Boolean)
    const maxTotal = groups.length ? groups[0][1].length : 0
    return { groups, statuses, maxTotal }
  }, [issues, groupBy, maxRows])

  const name = (n: string) => (renderName ? renderName(n) : n)

  if (groups.length === 0) {
    return <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>אין נושאים להצגה</div>
  }

  return (
    <div style={{ width: width ? `${width}px` : '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map(([gname, iss]) => {
          const total = iss.length
          const fill = maxTotal > 0 ? (total / maxTotal) * 100 : 0
          return (
            <div key={gname} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#4b5563', width: 96, flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name(gname)}>{name(gname)}</span>
              <div style={{ flex: 1, height: 16, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden' }}>
                <div style={{ display: 'flex', height: '100%', width: `${fill}%`, borderRadius: 8, overflow: 'hidden' }}>
                  {statuses.map(s => {
                    const c = iss.filter(i => i.status === s).length
                    if (c === 0) return null
                    const seg = (c / total) * 100
                    return (
                      <div key={s} style={{ width: `${seg}%`, background: statusColor(s), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} title={`${statusLabel(s)}: ${c}`}>
                        {seg >= 14 && <span style={{ fontSize: 8, fontWeight: 600, color: segmentTextColor(s), lineHeight: 1 }}>{c}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
              <span style={{ fontSize: 11, color: '#6b7280', width: 24, textAlign: 'left', flexShrink: 0, fontWeight: 500 }}>{total}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 8, marginTop: 8, borderTop: '1px solid #f3f4f6' }}>
        {statuses.map(s => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#6b7280' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: statusColor(s), display: 'inline-block' }} />
            {statusLabel(s)}
          </span>
        ))}
      </div>
    </div>
  )
}
