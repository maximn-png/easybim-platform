'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Loader2, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface GenerationConfig {
  llmProvider: 'cohere' | 'gemini'
  daysBack: number
  topicCount: number
  generateImages: boolean
  writingStyle: string
  activeSourceIds: string[]
}

interface ProgressTrackerProps {
  config: GenerationConfig
  onError: (msg: string) => void
}

const STEPS = [
  { label: 'Fetching articles from RSS sources' },
  { label: 'Selecting relevant topics with AI' },
  { label: 'Writing professional content' },
  { label: 'Generating images' },
  { label: 'Assembling the newsletter' },
]

export default function ProgressTracker({ config, onError }: ProgressTrackerProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [message, setMessage] = useState('Starting generation...')
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState(false)
  const router = useRouter()
  const startTime = useRef(Date.now())
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)

    const ctrl = new AbortController()

    async function startGeneration() {
      try {
        const res = await fetch('/api/newsletter/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
          signal: ctrl.signal,
        })

        if (!res.ok) { onError('Failed to start generation'); return }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break

          const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.error) { onError(event.error); return }
              if (event.done) {
                setCompletedSteps([1, 2, 3, 4, 5])
                setDone(true)
                clearInterval(timerRef.current)
                setTimeout(() => router.push(`/newsletter/${event.newsletterId}`), 1200)
                return
              }
              if (event.step) {
                setCurrentStep(event.step)
                setMessage(event.message)
                setCompletedSteps(Array.from({ length: event.step - 1 }, (_, i) => i + 1))
              }
            } catch { /* ignore parse errors */ }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') onError('Lost connection to server')
      }
    }

    startGeneration()
    return () => { ctrl.abort(); clearInterval(timerRef.current) }
  }, [])

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col items-center justify-center px-6">
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[#44b8d3]/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-[#1e248c]/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1e248c] to-[#44b8d3] flex items-center justify-center mx-auto mb-5 shadow-xl shadow-[#1e248c]/25">
            <Sparkles size={28} className="text-white" />
          </div>
          <h2 className="text-2xl font-black text-[#1e248c] mb-1">Generating your newsletter</h2>
          <p className="text-[#6b7280] text-sm">Elapsed: {formatTime(elapsed)}</p>
        </div>

        {/* Steps */}
        <div className="bg-white/70 backdrop-blur border border-white rounded-2xl p-6 shadow-sm space-y-3">
          {STEPS.map((s, i) => {
            const num = i + 1
            const isComplete = completedSteps.includes(num)
            const isActive = currentStep === num
            const isPending = !isComplete && !isActive

            return (
              <div
                key={num}
                className={`flex items-center gap-4 p-3.5 rounded-xl transition-all duration-500 ${
                  isComplete ? 'bg-emerald-50 border border-emerald-100' :
                  isActive   ? 'bg-[#1e248c]/5 border border-[#44b8d3]/30' :
                               'bg-transparent opacity-40'
                }`}
              >
                <div className={`relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isComplete ? 'bg-emerald-500' :
                  isActive   ? 'bg-[#1e248c]' :
                               'bg-[#e8eaff]'
                }`}>
                  {isComplete ? <CheckCircle size={18} className="text-white" /> :
                   isActive   ? <Loader2 size={18} className="text-white animate-spin" /> :
                                <span className="text-xs font-bold text-[#9ca3af]">{num}</span>}
                  {isActive && (
                    <div className="absolute inset-0 rounded-full border-2 border-[#44b8d3] animate-ping opacity-40" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${
                    isPending ? 'text-[#9ca3af]' : isComplete ? 'text-emerald-700' : 'text-[#1e248c]'
                  }`}>
                    Step {num} — {isActive ? message : s.label}
                  </div>
                </div>

                {isComplete && <CheckCircle size={15} className="text-emerald-500 flex-shrink-0" />}
              </div>
            )
          })}
        </div>

        {done && (
          <div className="mt-6 text-center bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-emerald-700 font-bold text-sm">Newsletter ready! Redirecting to preview...</p>
          </div>
        )}
      </div>
    </div>
  )
}
