'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/constants/rssFeeds'
import { RssCategory } from '@/lib/models/RssSource'

interface RssSource {
  _id: string
  name: string
  url: string
  category: RssCategory
  isActive: boolean
}

interface TopicSelectorProps {
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export default function TopicSelector({ selectedIds, onSelectionChange }: TopicSelectorProps) {
  const [sources, setSources] = useState<RssSource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/rss-sources')
      .then(r => r.json())
      .then(data => {
        setSources(data)
        onSelectionChange(data.filter((s: RssSource) => s.isActive).map((s: RssSource) => s._id))
        setLoading(false)
      })
  }, [])

  function toggleSource(id: string) {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter(sid => sid !== id)
        : [...selectedIds, id]
    )
  }

  function toggleAll() {
    onSelectionChange(
      selectedIds.length === sources.length ? [] : sources.map(s => s._id)
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <RefreshCw className="animate-spin text-[#44b8d3]" size={26} />
      </div>
    )
  }

  const byCategory = sources.reduce<Record<string, RssSource[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-bold text-[#1e248c] text-sm">RSS Sources</h3>
          <p className="text-xs text-[#6b7280] mt-0.5">{selectedIds.length} of {sources.length} sources selected</p>
        </div>
        <button
          onClick={toggleAll}
          className="text-sm font-semibold text-[#44b8d3] hover:text-[#1e248c] transition-colors"
        >
          {selectedIds.length === sources.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="space-y-5">
        {(Object.entries(byCategory) as [RssCategory, RssSource[]][]).map(([category, srcs]) => (
          <div key={category}>
            <div
              className="text-xs font-black uppercase tracking-wider mb-2 px-1"
              style={{ color: CATEGORY_COLORS[category] }}
            >
              {CATEGORY_LABELS[category]}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {srcs.map(source => {
                const isSelected = selectedIds.includes(source._id)
                return (
                  <button
                    key={source._id}
                    onClick={() => toggleSource(source._id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-current bg-white shadow-sm'
                        : 'border-[#e8eaff] bg-white/50 opacity-50 hover:opacity-80'
                    }`}
                    style={isSelected ? { borderColor: CATEGORY_COLORS[category] } : {}}
                  >
                    <div
                      className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: isSelected ? CATEGORY_COLORS[category] : '#e8eaff' }}
                    >
                      {isSelected && <span className="text-white text-[10px] font-black">✓</span>}
                    </div>
                    <span className="text-xs font-medium text-[#0a0a1a] leading-tight">{source.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
