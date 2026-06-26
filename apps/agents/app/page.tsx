import Link from 'next/link'
import { ArrowRight, Crown, ExternalLink } from 'lucide-react'
import { listAgents } from '@/lib/core/registry'
import { getPresentation } from '@/lib/agents/presentation'
import { connectDB } from '@/lib/db/mongoose'
import AgentRun from '@/lib/models/AgentRun'

export const dynamic = 'force-dynamic'

function timeAgo(d: Date | undefined): string {
  if (!d) return ''
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  running: { dot: '#f59e0b', label: 'Running', text: '#b45309' },
  done: { dot: '#22c55e', label: 'Idle', text: '#15803d' },
  error: { dot: '#ef4444', label: 'Error', text: '#b91c1c' },
  none: { dot: '#9ca3af', label: 'No runs yet', text: '#6b7280' },
}

export default async function KingdomPage() {
  await connectDB()
  const agents = listAgents()

  // Latest run per agent (for the status pill).
  const latest = await Promise.all(
    agents.map(async (a) => {
      const run = await AgentRun.findOne({ agentKey: a.key }).sort({ startedAt: -1 }).lean()
      return { key: a.key, run }
    })
  )
  const latestByKey = Object.fromEntries(latest.map((l) => [l.key, l.run]))
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000'

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}
    >
      {/* background depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-6%', right: '-8%', width: 680, height: 680, background: 'radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '-8%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(30,36,140,0.10) 0%, transparent 65%)' }} />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-10">
        {/* back to portal */}
        <a
          href={`${portalUrl}/dashboard`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold mb-8 transition-colors"
          style={{ color: 'rgba(30,36,140,0.7)' }}
        >
          <ArrowRight size={13} className="rotate-180" /> EasyBIM Platform
        </a>

        {/* hero */}
        <div className="flex flex-col items-center text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-4"
            style={{ background: 'rgba(124,58,237,0.10)', borderColor: 'rgba(124,58,237,0.30)', color: '#6d28d9' }}
          >
            <Crown size={12} style={{ color: '#7c3aed' }} />
            Agent Kingdom
          </div>
          <h1 className="font-black leading-tight mb-2" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', color: '#1e248c' }}>
            EasyBIM Agents
          </h1>
          <p className="text-sm max-w-md" style={{ color: '#6b7280' }}>
            Autonomous agents that run your workflows. The Lion orchestrates; each animal specializes.
          </p>
        </div>

        {/* agent cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((a) => {
            const p = getPresentation(a.key)
            const run = latestByKey[a.key] as { status?: string; startedAt?: Date } | null | undefined
            const st = STATUS_STYLE[run?.status ?? 'none'] ?? STATUS_STYLE.none
            return (
              <Link
                key={a.key}
                href={`/dashboard/${a.key}`}
                className="group bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ background: `${p.accent}18` }}
                >
                  {p.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-bold text-base" style={{ color: '#111827' }}>{a.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${p.accent}14`, color: p.accent }}>
                      {p.tagline}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: '#6b7280' }}>{a.description}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: st.text }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: st.dot }} />
                    {st.label}
                    {run?.startedAt && <span style={{ color: '#9ca3af' }}>· {timeAgo(run.startedAt)}</span>}
                  </span>
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" style={{ color: p.accent }} />
                </div>
              </Link>
            )
          })}

          {/* coming-soon placeholder hinting at the kingdom */}
          <div className="rounded-2xl p-6 flex flex-col items-center justify-center text-center border-2 border-dashed gap-2" style={{ borderColor: 'rgba(124,58,237,0.20)' }}>
            <span className="text-2xl opacity-50">🦁</span>
            <p className="text-xs font-semibold" style={{ color: '#9ca3af' }}>More animals coming</p>
            <p className="text-[11px]" style={{ color: '#b0b6c0' }}>Lion · Eagle · Owl · Bee …</p>
          </div>
        </div>

        <p className="mt-10 text-center text-[11px]" style={{ color: '#9ca3af' }}>
          <ExternalLink size={11} className="inline mr-1" />
          Runs are scheduled (weekly cron) and event-driven (Monday webhooks).
        </p>
      </main>
    </div>
  )
}
