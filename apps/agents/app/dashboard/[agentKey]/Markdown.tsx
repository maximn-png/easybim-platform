'use client'

import { useEffect, useState } from 'react'
import type { Components } from 'react-markdown'
import { Maximize2, X, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

// Parse a GFM markdown table's source into headers + raw-cell rows.
function parseMarkdownTable(src: string): { headers: string[]; rows: string[][] } {
  const lines = src
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  const parseRow = (l: string) =>
    l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const rowsRaw = lines.map(parseRow)
  const isSep = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))
  const headers = rowsRaw[0] ?? []
  const rows = rowsRaw.slice(1).filter((r) => !isSep(r))
  return { headers, rows }
}

// Stash a table (structured) in localStorage and open it in the standalone /table page.
function openTablePage(src: string) {
  const { headers, rows } = parseMarkdownTable(src)
  if (!headers.length) return
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  try {
    localStorage.setItem(`squirrel-table-${id}`, JSON.stringify({ headers, rows }))
    window.open(`/table?id=${id}`, '_blank')
  } catch {
    /* localStorage unavailable */
  }
}

// Markdown component set. `large` bumps sizing for the popped-out modal view.
// `onExpandTable` (when set) makes each table clickable → opens the modal.
function mdComponents(opts: {
  accent: string
  large?: boolean
  content?: string
  onExpandTable?: (src: string) => void
}): Components {
  const { accent, large, content, onExpandTable } = opts
  const cell = large ? 'px-4 py-2.5 text-sm' : 'px-2.5 py-1.5 text-xs'
  return {
    table: ({ children, node }) => {
      // Slice this table's markdown source (via mdast offsets) for the modal.
      const pos = (node as { position?: { start?: { offset?: number }; end?: { offset?: number } } })?.position
      const src =
        content && pos?.start?.offset != null && pos?.end?.offset != null
          ? content.slice(pos.start.offset, pos.end.offset)
          : null
      const clickable = !!(src && onExpandTable)
      return (
        <div className={large ? 'relative' : 'my-2 relative group'}>
          <div
            className="overflow-x-auto rounded-lg border"
            style={{ borderColor: 'rgba(0,0,0,0.08)', cursor: clickable ? 'zoom-in' : 'default' }}
            onClick={clickable ? () => onExpandTable!(src!) : undefined}
          >
            <table className={`w-full border-collapse ${large ? 'text-sm' : 'text-xs'}`}>{children}</table>
          </div>
          {clickable && (
            <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                type="button"
                title="הגדל טבלה"
                aria-label="Expand table"
                onClick={(e) => {
                  e.stopPropagation()
                  onExpandTable!(src!)
                }}
                className="bg-white/90 border rounded-md p-1 shadow-sm"
                style={{ borderColor: 'rgba(0,0,0,0.1)' }}
              >
                <Maximize2 size={13} style={{ color: accent }} />
              </button>
              <button
                type="button"
                title="פתח בעמוד חדש (מיון וייצוא CSV)"
                aria-label="Open in new page"
                onClick={(e) => {
                  e.stopPropagation()
                  openTablePage(src!)
                }}
                className="bg-white/90 border rounded-md p-1 shadow-sm"
                style={{ borderColor: 'rgba(0,0,0,0.1)' }}
              >
                <ExternalLink size={13} style={{ color: accent }} />
              </button>
            </div>
          )}
        </div>
      )
    },
    th: ({ children }) => (
      <th
        className={`${cell} font-semibold text-start border-b`}
        style={{ background: `${accent}12`, color: '#111827', borderColor: 'rgba(0,0,0,0.08)' }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`${cell} align-top border-b`} style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        {children}
      </td>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        style={{ color: accent }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    ),
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc mb-2 space-y-0.5" style={{ paddingInlineStart: '1.25rem' }}>{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal mb-2 space-y-0.5" style={{ paddingInlineStart: '1.25rem' }}>{children}</ol>,
    strong: ({ children }) => <strong className="font-semibold" style={{ color: '#111827' }}>{children}</strong>,
    code: ({ children }) => (
      <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'rgba(0,0,0,0.06)' }}>{children}</code>
    ),
    h1: ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
    h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
    h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  }
}

// Render an assistant message as rich markdown; tables pop out into a large modal on click.
export default function MarkdownView({ content, accent }: { content: string; accent: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <div className="text-sm leading-relaxed" style={{ color: '#374151' }} dir="auto">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents({ accent, content, onExpandTable: setExpanded })}>
        {content}
      </ReactMarkdown>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(17,24,39,0.55)' }}
          onClick={() => setExpanded(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-auto p-5"
            style={{ maxWidth: '95vw', maxHeight: '90vh' }}
            dir="auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2 gap-2">
              <button
                type="button"
                onClick={() => openTablePage(expanded)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors hover:bg-black/5"
                style={{ borderColor: `${accent}44`, color: accent }}
              >
                <ExternalLink size={13} /> פתח בעמוד (מיון + CSV)
              </button>
              <button
                type="button"
                onClick={() => setExpanded(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 hover:bg-black/5 transition-colors"
              >
                <X size={18} style={{ color: '#6b7280' }} />
              </button>
            </div>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents({ accent, large: true })}>
              {expanded}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
