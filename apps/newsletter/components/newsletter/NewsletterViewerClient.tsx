'use client'

import { useState } from 'react'
import { Pencil, X } from 'lucide-react'
import NewsletterPreview from './NewsletterPreview'
import NewsletterExport from './NewsletterExport'
import TopicBlock from './TopicBlock'

interface Topic {
  title: string
  body: string
  sourceUrl: string
  sourceName: string
  imageBase64?: string
}

interface Props {
  htmlOutput: string
  topics: Topic[]
  newsletterId: string
  date: string
}

export default function NewsletterViewerClient({ htmlOutput, topics, newsletterId, date }: Props) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[#1e248c] text-base">Preview</h2>
          <button
            onClick={() => setEditOpen(!editOpen)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              editOpen
                ? 'bg-[#1e248c] text-white'
                : 'bg-white border border-[#e8eaff] text-[#6b7280] hover:border-[#44b8d3] hover:text-[#1e248c]'
            }`}
          >
            {editOpen ? <><X size={14} /> Close Editor</> : <><Pencil size={14} /> Edit Topics</>}
          </button>
        </div>
        <NewsletterPreview htmlOutput={htmlOutput} />
      </div>

      <div className="bg-white/70 backdrop-blur border border-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-[#1e248c] mb-4 text-sm">Export Newsletter</h3>
        <NewsletterExport htmlOutput={htmlOutput} date={date} />
      </div>

      {editOpen && (
        <div>
          <h2 className="font-bold text-[#1e248c] text-base mb-4 flex items-center gap-2">
            <Pencil size={14} /> Edit Topics
          </h2>
          <div className="bg-white/70 backdrop-blur border border-white rounded-2xl p-6 space-y-6 shadow-sm">
            {topics.map((topic, i) => (
              <TopicBlock
                key={i}
                topic={topic}
                index={i}
                newsletterId={newsletterId}
                isLast={i === topics.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
