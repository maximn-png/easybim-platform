import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getAgent } from '@/lib/core/registry'
import { getPresentation } from '@/lib/agents/presentation'
import RunHistory from './RunHistory'
import HowItWorks from './HowItWorks'
import Chat from './Chat'

export const dynamic = 'force-dynamic'

export default async function AgentDashboardPage({ params }: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await params
  const agent = getAgent(agentKey)
  if (!agent) notFound()
  const p = getPresentation(agentKey)

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-6%', right: '-8%', width: 620, height: 620, background: `radial-gradient(circle, ${p.accent}22 0%, transparent 65%)` }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '-8%', width: 560, height: 560, background: 'radial-gradient(circle, rgba(30,36,140,0.08) 0%, transparent 65%)' }} />
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold mb-8 transition-colors"
          style={{ color: 'rgba(30,36,140,0.7)' }}
        >
          <ArrowLeft size={13} /> Agent Kingdom
        </Link>

        {/* agent header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ background: `${p.accent}18` }}>
            {p.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-black text-2xl" style={{ color: '#1e248c' }}>{agent.name}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${p.accent}14`, color: p.accent }}>
                {p.tagline}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#6b7280' }}>{agent.description}</p>
          </div>
        </div>

        {p.why && (
          <div
            className="mb-8 rounded-xl px-4 py-3 text-sm leading-relaxed"
            style={{ background: `${p.accent}0d`, borderLeft: `3px solid ${p.accent}`, color: '#4b5563' }}
          >
            <span className="font-semibold" style={{ color: p.accent }}>Why {agent.name}? </span>
            {p.why}
          </div>
        )}

        <HowItWorks accent={p.accent} />

        {agentKey === 'peacock' && (
          <div className="mb-8">
            <Chat agentKey={agentKey} accent={p.accent} emoji={p.emoji} />
          </div>
        )}

        <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: '#9ca3af' }}>Run history</h2>
        <RunHistory agentKey={agentKey} accent={p.accent} />
      </main>
    </div>
  )
}
