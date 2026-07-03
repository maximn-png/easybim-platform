import {
  PenLine,
  Bell,
  ImageIcon,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  Hand,
  Search,
  FolderPlus,
  FileSpreadsheet,
  Download,
  ListChecks,
  Send,
  type LucideIcon,
} from 'lucide-react'
import type { HowItWorks as HowItWorksData } from '@/lib/agents/presentation'

// Icon keys referenced by presentation.ts howItWorks steps.
const ICONS: Record<string, LucideIcon> = {
  PenLine,
  Bell,
  ImageIcon,
  CheckCircle2,
  Hand,
  Search,
  FolderPlus,
  FileSpreadsheet,
  Download,
  ListChecks,
  Send,
}

// Visual, low-text explainer of an agent's lifecycle + the user's role.
export default function HowItWorks({ accent, data }: { accent: string; data?: HowItWorksData }) {
  if (!data) return null

  return (
    <section className="mb-8 rounded-2xl p-5 bg-white/55 backdrop-blur-sm border border-white/90 shadow-sm">
      <h2 className="text-[11px] font-bold uppercase tracking-wide mb-4" style={{ color: '#9ca3af' }}>
        {data.title}
      </h2>

      {/* lifecycle strip */}
      <div className="flex flex-wrap items-center gap-y-3">
        {data.steps.map((s, i) => {
          const Icon = ICONS[s.icon] ?? CheckCircle2
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
                <span className="text-[11px] font-semibold leading-tight" style={{ color: '#374151' }}>
                  {s.label}
                </span>
                <span className="text-[10px] leading-tight" style={{ color: '#9ca3af' }}>
                  {s.sub}
                </span>
              </div>
              {i < data.steps.length - 1 && (
                <ArrowRight size={14} className="mx-0.5 shrink-0" style={{ color: '#d1d5db' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* role + teach notes */}
      {(data.roleNote || data.teachNote) && (
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          {data.roleNote && (
            <div className="flex items-start gap-2 flex-1 rounded-xl p-3" style={{ background: 'rgba(68,184,211,0.08)' }}>
              <Hand size={15} className="mt-0.5 shrink-0" style={{ color: '#0e7490' }} />
              <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>
                {data.roleNote}
              </p>
            </div>
          )}
          {data.teachNote && (
            <div className="flex items-start gap-2 flex-1 rounded-xl p-3" style={{ background: `${accent}0d` }}>
              <RefreshCw size={15} className="mt-0.5 shrink-0" style={{ color: accent }} />
              <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>
                {data.teachNote}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
