'use client'

import { Zap, Image as ImageIcon, MessageCircle, Code2, Flame, Briefcase } from 'lucide-react'

type WritingStyle = 'casual' | 'technical' | 'enthusiastic' | 'professional'

interface LLMSelectorProps {
  value: 'cohere' | 'gemini'
  onChange: (value: 'cohere' | 'gemini') => void
  generateImages: boolean
  onToggleImages: (val: boolean) => void
  topicCount: number
  onTopicCountChange: (val: number) => void
  daysBack: number
  onDaysBackChange: (val: number) => void
  writingStyle: WritingStyle
  onWritingStyleChange: (val: WritingStyle) => void
}

const DAYS_OPTIONS = [3, 7, 14, 30]

const WRITING_STYLES: { id: WritingStyle; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'casual',       label: 'Casual',       desc: 'Friendly & conversational',  icon: <MessageCircle size={16} /> },
  { id: 'technical',    label: 'Technical',    desc: 'Precise & detail-oriented',  icon: <Code2 size={16} /> },
  { id: 'enthusiastic', label: 'Enthusiastic', desc: 'High-energy & inspiring',    icon: <Flame size={16} /> },
  { id: 'professional', label: 'Professional', desc: 'Formal & authoritative',     icon: <Briefcase size={16} /> },
]

export default function LLMSelector({
  value, onChange, generateImages, onToggleImages,
  topicCount, onTopicCountChange, daysBack, onDaysBackChange,
  writingStyle, onWritingStyleChange,
}: LLMSelectorProps) {
  return (
    <div className="space-y-5">

      {/* AI Model */}
      <div>
        <h3 className="font-bold text-[#1e248c] text-sm mb-3">Choose AI Model</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onChange('cohere')}
            className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
              value === 'cohere'
                ? 'border-[#1e248c] bg-gradient-to-br from-[#1e248c]/5 to-[#44b8d3]/5 shadow-md'
                : 'border-[#e8eaff] bg-white hover:border-[#1e248c]/40'
            }`}
          >
            {value === 'cohere' && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#1e248c] flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            )}
            <Zap size={22} className="text-[#1e248c] mb-2" />
            <div className="font-bold text-[#1e248c] text-sm">Cohere Command A</div>
            <span className="inline-block mt-1.5 bg-[#1e248c] text-white text-xs px-2 py-0.5 rounded-full">Faster</span>
            <p className="text-xs text-[#6b7280] mt-2 leading-relaxed">Fast, high-quality text generation.</p>
          </button>

          <button
            onClick={() => onChange('gemini')}
            className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
              value === 'gemini'
                ? 'border-[#44b8d3] bg-gradient-to-br from-[#44b8d3]/5 to-[#1e248c]/5 shadow-md'
                : 'border-[#e8eaff] bg-white hover:border-[#44b8d3]/40'
            }`}
          >
            {value === 'gemini' && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#44b8d3] flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            )}
            <ImageIcon size={22} className="text-[#44b8d3] mb-2" />
            <div className="font-bold text-[#44b8d3] text-sm">Gemini 2.5 Pro</div>
            <span className="inline-block mt-1.5 bg-[#44b8d3] text-white text-xs px-2 py-0.5 rounded-full">Most Capable</span>
            <p className="text-xs text-[#6b7280] mt-2 leading-relaxed">Google's most capable model. Requires Gemini key.</p>
          </button>
        </div>
      </div>

      {/* Writing Style */}
      <div>
        <h3 className="font-bold text-[#1e248c] text-sm mb-3">Writing Style</h3>
        <div className="grid grid-cols-2 gap-2">
          {WRITING_STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => onWritingStyleChange(s.id)}
              className={`flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                writingStyle === s.id
                  ? 'border-[#1e248c] bg-[#1e248c]/5 shadow-sm'
                  : 'border-[#e8eaff] bg-white hover:border-[#1e248c]/30'
              }`}
            >
              <span className={`mt-0.5 flex-shrink-0 ${writingStyle === s.id ? 'text-[#1e248c]' : 'text-[#9ca3af]'}`}>
                {s.icon}
              </span>
              <div>
                <div className={`text-sm font-bold leading-tight ${writingStyle === s.id ? 'text-[#1e248c]' : 'text-[#374151]'}`}>
                  {s.label}
                </div>
                <div className="text-xs text-[#6b7280] mt-0.5">{s.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Image generation — always available */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-[#e8eaff] px-5 py-4">
        <div>
          <div className="font-semibold text-[#0a0a1a] text-sm">Generate images with Gemini Imagen 4</div>
          <div className="text-xs text-[#6b7280] mt-0.5">Adds ~2 min · Gemini API key required</div>
        </div>
        <button
          onClick={() => onToggleImages(!generateImages)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${generateImages ? 'bg-[#44b8d3]' : 'bg-gray-200'}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${generateImages ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Days back */}
      <div className="bg-white rounded-2xl border border-[#e8eaff] px-5 py-4">
        <div className="font-semibold text-[#0a0a1a] text-sm mb-3">Days back to scan</div>
        <div className="flex gap-2">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => onDaysBackChange(d)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                daysBack === d
                  ? 'bg-[#1e248c] text-white shadow-sm'
                  : 'bg-[#f0f2ff] text-[#6b7280] hover:text-[#1e248c]'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Topic count */}
      <div className="bg-white rounded-2xl border border-[#e8eaff] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-[#0a0a1a] text-sm">Number of topics</span>
          <span className="text-2xl font-black text-[#1e248c]">{topicCount}</span>
        </div>
        <input
          type="range" min={3} max={7} value={topicCount}
          onChange={e => onTopicCountChange(Number(e.target.value))}
          className="w-full accent-[#1e248c]"
        />
        <div className="flex justify-between text-xs text-[#6b7280] mt-1">
          <span>3</span><span>5</span><span>7</span>
        </div>
      </div>

    </div>
  )
}
