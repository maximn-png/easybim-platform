import { PenLine, Bell, ImageIcon, RefreshCw, ArrowRight, CheckCircle2, Hand } from 'lucide-react'

// Visual, low-text explainer of the Peacock lifecycle + the user's role.
const STEPS = [
  { icon: PenLine, label: 'Peacock drafts', sub: '2 posts / week', who: 'agent' },
  { icon: Bell, label: 'Pending Approval', sub: 'tagged to you', who: 'agent' },
  { icon: Hand, label: 'You decide', sub: 'approve or revise', who: 'you' },
  { icon: ImageIcon, label: 'Branded image', sub: 'on approval', who: 'agent' },
  { icon: CheckCircle2, label: 'Ready to Publish', sub: 'finished package', who: 'agent' },
]

export default function HowItWorks({ accent }: { accent: string }) {
  return (
    <section className="mb-8 rounded-2xl p-5 bg-white/55 backdrop-blur-sm border border-white/90 shadow-sm">
      <h2 className="text-[11px] font-bold uppercase tracking-wide mb-4" style={{ color: '#9ca3af' }}>How Peacock works</h2>

      {/* lifecycle strip */}
      <div className="flex flex-wrap items-center gap-y-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const isYou = s.who === 'you'
          const c = isYou ? '#44b8d3' : accent
          return (
            <div key={s.label} className="flex items-center">
              <div className="flex flex-col items-center text-center" style={{ width: 92 }}>
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-1.5"
                  style={{ background: `${c}16`, border: isYou ? `1.5px solid ${c}55` : 'none' }}
                >
                  <Icon size={20} style={{ color: c }} />
                </div>
                <span className="text-[11px] font-semibold leading-tight" style={{ color: '#374151' }}>{s.label}</span>
                <span className="text-[10px] leading-tight" style={{ color: '#9ca3af' }}>{s.sub}</span>
              </div>
              {i < STEPS.length - 1 && <ArrowRight size={14} className="mx-0.5 shrink-0" style={{ color: '#d1d5db' }} />}
            </div>
          )
        })}
      </div>

      {/* revise loop note + your role */}
      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <div className="flex items-start gap-2 flex-1 rounded-xl p-3" style={{ background: 'rgba(68,184,211,0.08)' }}>
          <Hand size={15} className="mt-0.5 shrink-0" style={{ color: '#0e7490' }} />
          <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>
            <span className="font-semibold">Your role:</span> approve a draft you like, or reply on its Monday update with feedback and set it to <span className="font-semibold">Revise</span> — Peacock rewrites it.
          </p>
        </div>
        <div className="flex items-start gap-2 flex-1 rounded-xl p-3" style={{ background: `${accent}0d` }}>
          <RefreshCw size={15} className="mt-0.5 shrink-0" style={{ color: accent }} />
          <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>
            <span className="font-semibold">Teach it:</span> tell Peacock your preferences in the chat below (e.g. &ldquo;keep posts shorter&rdquo;) and it remembers them for future posts.
          </p>
        </div>
      </div>
    </section>
  )
}
