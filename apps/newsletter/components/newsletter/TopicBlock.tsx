'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Edit3, Check } from 'lucide-react'

interface Topic {
  title: string
  body: string
  sourceUrl: string
  sourceName: string
  imageBase64?: string
}

interface TopicBlockProps {
  topic: Topic
  index: number
  newsletterId: string
  isLast: boolean
}

export default function TopicBlock({ topic, index, newsletterId, isLast }: TopicBlockProps) {
  const [body, setBody] = useState(topic.body)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  async function saveEdit() {
    setSaving(true)
    await fetch(`/api/newsletter/${newsletterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicIndex: index, body }),
    })
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  return (
    <div>
      {topic.imageBase64 ? (
        <img
          src={`data:image/png;base64,${topic.imageBase64}`}
          alt={topic.title}
          className="w-full h-44 object-cover rounded-xl mb-4"
        />
      ) : (
        <div className="w-full h-36 bg-gradient-to-br from-[#1e248c] to-[#44b8d3] rounded-xl flex items-center justify-center mb-4 opacity-80">
          <span className="text-white/40 text-3xl">⚙</span>
        </div>
      )}

      <h3 className="font-bold text-[#1e248c] text-base leading-snug mb-3">{topic.title}</h3>

      <div className="relative group">
        {editing ? (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-sm text-[#0a0a1a] leading-relaxed border-2 border-[#44b8d3] rounded-xl focus:outline-none resize-none"
              autoFocus
            />
            <button
              onClick={saveEdit}
              disabled={saving}
              className="absolute bottom-3 right-3 flex items-center gap-1 bg-[#1e248c] text-white text-xs px-3 py-1.5 rounded-lg font-semibold"
            >
              {saving ? 'Saving...' : <><Check size={12} /> Save</>}
            </button>
          </div>
        ) : (
          <div className="relative">
            <p className="text-sm text-[#374151] leading-relaxed">{body}</p>
            <button
              onClick={() => setEditing(true)}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-[#e8eaff] rounded-lg px-2 py-1 text-xs text-[#6b7280] hover:text-[#1e248c] flex items-center gap-1 shadow-sm"
            >
              <Edit3 size={11} /> Edit
            </button>
          </div>
        )}
      </div>

      <a
        href={topic.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-[#44b8d3] hover:text-[#1e248c] transition-colors mt-3 font-medium"
      >
        <ExternalLink size={11} /> {topic.sourceName}
      </a>

      {!isLast && <div className="h-px bg-[#e8eaff] mt-6" />}
    </div>
  )
}
