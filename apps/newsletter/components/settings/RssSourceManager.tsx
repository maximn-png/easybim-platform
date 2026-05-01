'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/constants/rssFeeds'
import { RssCategory } from '@/lib/models/RssSource'

interface RssSource {
  _id: string
  name: string
  url: string
  category: RssCategory
  isActive: boolean
  lastFetched?: string
}

const CATEGORIES: RssCategory[] = ['bim', 'ai-bim', 'mep-coordination', 'infrastructure', 'israel-gov', 'construction']

export default function RssSourceManager() {
  const [sources, setSources] = useState<RssSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newSource, setNewSource] = useState({ name: '', url: '', category: 'bim' as RssCategory })
  const [adding, setAdding] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { loadSources() }, [])

  async function loadSources() {
    setLoading(true)
    const res = await fetch('/api/rss-sources')
    if (res.ok) setSources(await res.json())
    setLoading(false)
  }

  async function toggleSource(id: string, isActive: boolean) {
    await fetch('/api/rss-sources', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    })
    setSources(prev => prev.map(s => s._id === id ? { ...s, isActive } : s))
  }

  async function addSource() {
    if (!newSource.name || !newSource.url) return
    setAdding(true)
    const res = await fetch('/api/rss-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSource),
    })
    if (res.ok) {
      const created = await res.json()
      setSources(prev => [...prev, created])
      setShowModal(false)
      setNewSource({ name: '', url: '', category: 'bim' })
    }
    setAdding(false)
  }

  async function deleteSource(id: string) {
    await fetch(`/api/rss-sources?id=${id}`, { method: 'DELETE' })
    setSources(prev => prev.filter(s => s._id !== id))
    setDeleteId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <RefreshCw className="animate-spin text-[#44b8d3]" size={28} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#1e248c]">RSS Sources</h2>
          <p className="text-sm text-[#6b7280] mt-1">{sources.filter(s => s.isActive).length} active sources out of {sources.length}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 btn-primary px-4 py-2.5 text-sm"
        >
          <Plus size={16} /> Add Source
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8eaff]">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f8f9ff] border-b border-[#e8eaff]">
              <th className="text-right px-4 py-3 text-sm font-semibold text-[#6b7280]">Name</th>
              <th className="text-right px-4 py-3 text-sm font-semibold text-[#6b7280]">Category</th>
              <th className="text-right px-4 py-3 text-sm font-semibold text-[#6b7280]">URL</th>
              <th className="text-center px-4 py-3 text-sm font-semibold text-[#6b7280]">Active</th>
              <th className="text-center px-4 py-3 text-sm font-semibold text-[#6b7280]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source, i) => (
              <tr key={source._id} className={`border-b border-[#f0f2ff] ${i % 2 === 0 ? 'bg-white' : 'bg-[#f8f9ff]'}`}>
                <td className="px-4 py-3">
                  <span className="font-medium text-[#0a0a1a] text-sm">{source.name}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: CATEGORY_COLORS[source.category] }}
                  >
                    {CATEGORY_LABELS[source.category]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-[#6b7280] font-mono truncate block max-w-[180px]" dir="ltr">
                    {source.url}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleSource(source._id, !source.isActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${source.isActive ? 'bg-[#44b8d3]' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${source.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  {deleteId === source._id ? (
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => deleteSource(source._id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">Delete</button>
                      <button onClick={() => setDeleteId(null)} className="text-[#6b7280] text-xs">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(source._id)} className="text-[#6b7280] hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Source Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
            <h3 className="text-lg font-bold text-[#1e248c] mb-5">Add New RSS Source</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#0a0a1a] mb-1.5">Source Name</label>
                <input
                  value={newSource.name}
                  onChange={e => setNewSource(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Autodesk Blog"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e8eaff] text-sm focus:outline-none focus:border-[#44b8d3]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0a0a1a] mb-1.5">Feed URL</label>
                <input
                  value={newSource.url}
                  onChange={e => setNewSource(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://example.com/feed"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e8eaff] text-sm font-mono focus:outline-none focus:border-[#44b8d3]"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0a0a1a] mb-1.5">Category</label>
                <select
                  value={newSource.category}
                  onChange={e => setNewSource(p => ({ ...p, category: e.target.value as RssCategory }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e8eaff] text-sm focus:outline-none focus:border-[#44b8d3]"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border-2 border-[#e8eaff] text-[#6b7280] font-semibold text-sm hover:border-[#1e248c] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={addSource}
                disabled={adding || !newSource.name || !newSource.url}
                className="flex-1 py-2.5 rounded-xl btn-primary text-sm disabled:opacity-40"
              >
                {adding ? 'Adding...' : 'Add Source'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
