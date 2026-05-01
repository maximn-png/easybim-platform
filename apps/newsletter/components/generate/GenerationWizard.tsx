'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import TopicSelector from './TopicSelector'
import LLMSelector from './LLMSelector'
import ProgressTracker from './ProgressTracker'
import AppHeader from '@/components/AppHeader'

type Step = 1 | 2 | 3

interface WizardConfig {
  llmProvider: 'cohere' | 'gemini'
  daysBack: number
  topicCount: number
  generateImages: boolean
  writingStyle: 'casual' | 'technical' | 'enthusiastic' | 'professional'
  activeSourceIds: string[]
}

const STEP_LABELS = ['Select Sources', 'Configure', 'Generate']

export default function GenerationWizard() {
  const [step, setStep] = useState<Step>(1)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<WizardConfig>({
    llmProvider: 'gemini',
    daysBack: 7,
    topicCount: 7,
    generateImages: false,
    writingStyle: 'professional',
    activeSourceIds: [],
  })

  if (step === 3) {
    return (
      <ProgressTracker
        config={config}
        onError={(msg) => { setError(msg); setStep(2) }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[#44b8d3]/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-[#1e248c]/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      <AppHeader />

      <main className="relative max-w-2xl mx-auto px-6 py-10">

        {/* Title */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#44b8d3]/10 border border-[#44b8d3]/30 text-[#1e248c] text-xs font-semibold mb-3">
            <Sparkles size={12} className="text-[#44b8d3]" />
            AI Newsletter Generator
          </div>
          <h1 className="text-3xl font-black text-[#1e248c]">Create Newsletter</h1>
          <p className="text-[#6b7280] text-sm mt-1">Professional BIM content from 21 RSS sources</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEP_LABELS.map((label, i) => {
            const num = i + 1
            const isActive = step === num
            const isDone = step > num
            return (
              <div key={num} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  isDone   ? 'bg-emerald-500 text-white' :
                  isActive ? 'bg-[#1e248c] text-white' :
                             'bg-[#e8eaff] text-[#9ca3af]'
                }`}>
                  {isDone ? '✓' : num}
                </div>
                <span className={`text-sm font-semibold ${isActive ? 'text-[#1e248c]' : 'text-[#9ca3af]'}`}>
                  {label}
                </span>
                {i < STEP_LABELS.length - 1 && (
                  <div className="w-8 h-0.5 bg-[#e8eaff] mx-1" />
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="bg-white/70 backdrop-blur border border-white rounded-2xl p-6 shadow-sm mb-6" key={step}>
          {step === 1 && (
            <TopicSelector
              selectedIds={config.activeSourceIds}
              onSelectionChange={(ids) => setConfig(c => ({ ...c, activeSourceIds: ids }))}
            />
          )}
          {step === 2 && (
            <LLMSelector
              value={config.llmProvider}
              onChange={(v) => setConfig(c => ({ ...c, llmProvider: v }))}
              generateImages={config.generateImages}
              onToggleImages={(v) => setConfig(c => ({ ...c, generateImages: v }))}
              topicCount={config.topicCount}
              onTopicCountChange={(v) => setConfig(c => ({ ...c, topicCount: v }))}
              daysBack={config.daysBack}
              onDaysBackChange={(v) => setConfig(c => ({ ...c, daysBack: v }))}
              writingStyle={config.writingStyle}
              onWritingStyleChange={(v) => setConfig(c => ({ ...c, writingStyle: v }))}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => (s - 1) as Step)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-[#e8eaff] text-[#6b7280] font-semibold text-sm hover:border-[#1e248c] hover:text-[#1e248c] transition-all"
            >
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}

          <button
            onClick={() => setStep(s => (s < 2 ? (s + 1) as Step : 3))}
            disabled={step === 1 && config.activeSourceIds.length === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1e248c] text-white font-bold text-sm hover:bg-[#1e248c]/90 transition-all shadow-md shadow-[#1e248c]/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 2 ? (
              <><Sparkles size={15} /> Generate Newsletter</>
            ) : (
              <>Continue <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
