'use client'

import { useState, useEffect } from 'react'
import { Loader2, Sparkles, RotateCcw } from 'lucide-react'
import { DEFAULT_STYLE_PROFILE } from '@/lib/constants/prompts'

export default function StyleProfileUploader() {
  const [posts, setPosts] = useState('')
  const [styleNotes, setStyleNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetch('/api/style-profile')
      .then(r => r.json())
      .then(data => {
        if (data.styleNotes) setStyleNotes(data.styleNotes)
        if (data.linkedinPosts?.length) setPosts(data.linkedinPosts.join('\n\n---\n\n'))
      })
  }, [])

  async function analyzeStyle() {
    if (!posts.trim()) return
    setLoading(true)
    const separated = posts.split('---').map(p => p.trim()).filter(Boolean)
    const res = await fetch('/api/style-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedinPosts: separated }),
    })
    if (res.ok) {
      const data = await res.json()
      setStyleNotes(data.styleNotes)
    }
    setLoading(false)
  }

  async function resetProfile() {
    setResetting(true)
    const res = await fetch('/api/style-profile', { method: 'DELETE' })
    if (res.ok) {
      setStyleNotes(DEFAULT_STYLE_PROFILE)
      setPosts('')
    }
    setResetting(false)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-[#e8eaff] p-6 shadow-sm">
        <h3 className="font-bold text-[#1e248c] text-lg mb-2">LinkedIn Posts</h3>
        <p className="text-sm text-[#6b7280] mb-4">Paste your LinkedIn posts — separate posts with <code className="bg-[#f0f2ff] px-1 rounded">---</code></p>
        <textarea
          value={posts}
          onChange={e => setPosts(e.target.value)}
          rows={10}
          placeholder="Paste your LinkedIn posts here..."
          className="w-full px-4 py-3 rounded-xl border border-[#e8eaff] bg-[#f8f9ff] text-sm leading-relaxed focus:outline-none focus:border-[#44b8d3] resize-none"
          dir="rtl"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={analyzeStyle}
            disabled={!posts.trim() || loading}
            className="flex items-center gap-2 btn-primary px-5 py-2.5 text-sm disabled:opacity-40"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Analyzing...' : 'Analyze Style'}
          </button>
          <button
            onClick={resetProfile}
            disabled={resetting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-[#e8eaff] text-[#6b7280] font-semibold text-sm hover:border-red-200 hover:text-red-500 transition-all disabled:opacity-40"
          >
            <RotateCcw size={16} />
            {resetting ? 'Resetting...' : 'Reset Style'}
          </button>
        </div>
      </div>

      {styleNotes && (
        <div className="glass-card rounded-2xl p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-[#44b8d3]" />
            <h3 className="font-bold text-[#1e248c]">Extracted Style Profile</h3>
          </div>
          <p className="text-sm text-[#0a0a1a] leading-relaxed whitespace-pre-wrap" dir="rtl">
            {styleNotes}
          </p>
        </div>
      )}
    </div>
  )
}
