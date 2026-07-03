'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, Download, Table2 } from 'lucide-react'

interface TableData {
  headers: string[]
  rows: string[][]
}

const ACCENT = '#b45309'

// Strip markdown from a cell → plain text (for sorting, CSV, and fallback display).
function cellText(raw: string): string {
  return (raw ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** → bold
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

// Extract a single markdown link from a cell, if present.
function cellLink(raw: string): { text: string; url: string } | null {
  const m = (raw ?? '').match(/\[([^\]]+)\]\(([^)]+)\)/)
  return m ? { text: m[1], url: m[2] } : null
}

// Numeric value of a cell (₪, commas, m² stripped), or null if not numeric.
function toNum(raw: string): number | null {
  const t = cellText(raw)
  if (!/\d/.test(t)) return null
  const cleaned = t.replace(/[^\d.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function TablePage() {
  const [data, setData] = useState<TableData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('id')
      const raw = id ? localStorage.getItem(`squirrel-table-${id}`) : null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read from localStorage (client-only, avoids hydration mismatch)
      if (raw) setData(JSON.parse(raw))
    } catch {
      /* ignore */
    }
    setLoaded(true)
  }, [])

  const sortedRows = useMemo(() => {
    if (!data) return []
    if (sortCol == null) return data.rows
    const c = sortCol
    const copy = [...data.rows]
    copy.sort((a, b) => {
      const na = toNum(a[c] ?? '')
      const nb = toNum(b[c] ?? '')
      let r: number
      if (na != null && nb != null) r = na - nb
      else r = cellText(a[c] ?? '').localeCompare(cellText(b[c] ?? ''), 'he')
      return sortDir === 'asc' ? r : -r
    })
    return copy
  }, [data, sortCol, sortDir])

  function toggleSort(c: number) {
    if (sortCol === c) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortCol(c)
      setSortDir('asc')
    }
  }

  function downloadCsv() {
    if (!data) return
    const lines = [data.headers, ...sortedRows.map((r) => r.map(cellText))]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n')
    const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'squirrel-comparison.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }} dir="rtl">
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${ACCENT}18` }}>🐿️</div>
            <div>
              <h1 className="font-black text-lg" style={{ color: '#1e248c' }}>Squirrel — טבלת השוואה</h1>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                {data ? `${data.rows.length} שורות · לחץ על כותרת למיון` : ''}
              </p>
            </div>
          </div>
          {data && (
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-xl px-3.5 py-2 text-white shadow-sm"
              style={{ background: ACCENT }}
            >
              <Download size={15} /> ייצוא CSV
            </button>
          )}
        </div>

        {!loaded ? (
          <p className="text-sm text-center mt-20" style={{ color: '#9ca3af' }}>טוען…</p>
        ) : !data ? (
          <div className="text-center mt-20">
            <Table2 size={28} className="mx-auto mb-2" style={{ color: '#cbd5e1' }} />
            <p className="text-sm font-semibold" style={{ color: '#6b7280' }}>לא נמצאה טבלה</p>
            <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>פתח טבלה מתוך הצ׳אט של Squirrel כדי לראות אותה כאן.</p>
          </div>
        ) : (
          <div className="bg-white/70 backdrop-blur-sm border border-white/90 rounded-2xl shadow-sm overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {data.headers.map((h, ci) => (
                    <th
                      key={ci}
                      onClick={() => toggleSort(ci)}
                      className="px-4 py-2.5 font-semibold text-start border-b cursor-pointer select-none whitespace-nowrap"
                      style={{ background: `${ACCENT}12`, color: '#111827', borderColor: 'rgba(0,0,0,0.08)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {cellText(h)}
                        {sortCol === ci && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
                    {row.map((cell, ci) => {
                      const link = cellLink(cell)
                      return (
                        <td key={ci} className="px-4 py-2.5 align-top border-b" style={{ borderColor: 'rgba(0,0,0,0.05)', color: '#374151' }}>
                          {link ? (
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: ACCENT }}>
                              {link.text}
                            </a>
                          ) : (
                            cellText(cell)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
