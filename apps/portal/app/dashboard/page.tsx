import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Newspaper, Database, BookOpen, ArrowRight, Clock, Sparkles, Crown } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import CursorEffect from '@/components/CursorEffect'
import PhotoGallery from '@/components/PhotoGallery'

async function getQuote() {
  try {
    const res = await fetch(
      'https://api.quotable.io/random?tags=technology|business|success|inspirational&maxLength=160',
      { cache: 'no-store' }
    )
    const data = await res.json()
    if (data.content && data.author) return { content: data.content as string, author: data.author as string }
  } catch {}
  // Fallback quotes if API is unavailable
  const fallbacks = [
    { content: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs' },
    { content: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
    { content: 'Coming together is a beginning. Keeping together is progress. Working together is success.', author: 'Henry Ford' },
  ]
  return fallbacks[Math.floor(Math.random() * fallbacks.length)]
}

const PARTICLES = [
  { x: '8%',  y: '18%', size: 3, delay: '0s',    dur: '7s'   },
  { x: '88%', y: '12%', size: 2, delay: '1.2s',  dur: '8.5s' },
  { x: '72%', y: '68%', size: 4, delay: '2.1s',  dur: '6.5s' },
  { x: '18%', y: '78%', size: 2, delay: '0.7s',  dur: '9s'   },
  { x: '48%', y: '8%',  size: 3, delay: '3.3s',  dur: '7.5s' },
  { x: '92%', y: '52%', size: 2, delay: '1.8s',  dur: '8s'   },
  { x: '28%', y: '42%', size: 2, delay: '4.1s',  dur: '6s'   },
  { x: '62%', y: '88%', size: 3, delay: '2.8s',  dur: '7s'   },
]

const TOOLS = [
  {
    id: 'newsletter',
    title: 'Newsletter Generator',
    description:
      'Generate AI-powered BIM industry newsletters from 21 RSS sources using Google Gemini. Ready to send in under a minute.',
    icon: Newspaper,
    href: process.env.NEXT_PUBLIC_NEWSLETTER_URL || '#',
    status: 'live' as const,
    color: '#1e248c',
  },
  {
    id: 'easybim-projects',
    title: 'EasyBIM Projects',
    description:
      'Track, manage, and collaborate on BIM projects in one place. Built around the EasyBIM team\'s workflow.',
    icon: Database,
    href: process.env.NEXT_PUBLIC_EPM_URL || '#',
    status: 'live' as const,
    color: '#44b8d3',
  },
  {
    id: 'revit-sync',
    title: 'EasyBIM Knowledge Center',
    description:
      'Your central hub for EasyBIM standards, BIM guides, templates, and best practices — find the right workflow and answer in seconds.',
    icon: BookOpen,
    href: '#',
    status: 'coming-soon' as const,
    color: '#818cf8',
  },
  {
    id: 'agents',
    title: 'EasyBIM Agents Kingdom',
    description:
      'Autonomous agents that run your workflows. Peacock drafts and routes weekly LinkedIn posts through Monday — you just approve.',
    icon: Crown,
    href: process.env.NEXT_PUBLIC_AGENTS_URL || '#',
    // Only advertise as Live when the agents URL is actually configured for this
    // environment — otherwise show "coming soon" instead of a dead `#` link.
    status: (process.env.NEXT_PUBLIC_AGENTS_URL ? 'live' : 'coming-soon') as 'live' | 'coming-soon',
    color: '#7c3aed',
  },
]

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const quote = await getQuote()

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}
    >
      <CursorEffect />

      {/* Background depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-5%', right: '-8%', width: 700, height: 700, background: 'radial-gradient(circle, rgba(68,184,211,0.18) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '-8%', width: 620, height: 620, background: 'radial-gradient(circle, rgba(30,36,140,0.10) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', top: '45%', left: '45%', width: 480, height: 480, background: 'radial-gradient(circle, rgba(68,184,211,0.07) 0%, transparent 65%)', transform: 'translate(-50%,-50%)' }} />
        {PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: 'absolute', left: p.x, top: p.y,
            width: p.size, height: p.size, borderRadius: '50%',
            background: '#44b8d3',
            animation: `landing-float ${p.dur} ${p.delay} ease-in-out infinite`,
          }} />
        ))}
      </div>

      <AppHeader />

      <main className="relative z-10">
        {/* ── Centered hero header ── */}
        <div className="flex flex-col items-center text-center px-6 pt-6 pb-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-3"
            style={{ background: 'rgba(68,184,211,0.10)', borderColor: 'rgba(68,184,211,0.30)', color: '#1e248c' }}
          >
            <Sparkles size={11} style={{ color: '#44b8d3' }} />
            Your Workspace
          </div>

          <h1
            className="font-black leading-tight mb-2"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', color: '#1e248c' }}
          >
            Your EasyBIM Platform
          </h1>

          <p className="text-sm mb-2" style={{ color: '#6b7280' }}>
            All EasyBIM workflow tools — one click away.
          </p>

          {quote && (
            <div className="max-w-lg mx-auto text-center mt-2">
              <p className="italic text-sm leading-relaxed" style={{ color: '#4b5563' }}>
                <span className="text-xl font-black not-italic mr-0.5" style={{ color: '#44b8d3' }}>&ldquo;</span>
                {quote.content}
                <span className="text-xl font-black not-italic ml-0.5" style={{ color: '#44b8d3' }}>&rdquo;</span>
              </p>
              <p className="text-xs font-semibold mt-2 tracking-wide" style={{ color: 'rgba(30,36,140,0.7)' }}>
                — {quote.author}
              </p>
            </div>
          )}
        </div>

        {/* ── Tool cards ── */}
        <div className="px-6 pb-6 max-w-4xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TOOLS.map((tool) => {
              const Icon = tool.icon
              const isLive = tool.status === 'live'
              const cardClassName =
                'bg-white/65 backdrop-blur-sm border border-white/90 rounded-2xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300'
              const cardBody = (
                <>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: `${tool.color}18` }}
                  >
                    <Icon size={24} style={{ color: tool.color }} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="font-bold text-sm" style={{ color: '#111827' }}>{tool.title}</h2>
                      {tool.status === 'live' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-semibold">
                          Live
                        </span>
                      )}
                      {tool.status === 'coming-soon' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#f0f2ff', color: '#6b7280' }}>
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>{tool.description}</p>
                  </div>

                  {isLive ? (
                    <span
                      className="flex items-center gap-1.5 text-sm font-semibold transition-colors"
                      style={{ color: '#1e248c' }}
                    >
                      Open tool <ArrowRight size={14} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: '#9ca3af' }}>
                      <Clock size={13} /> Coming soon
                    </span>
                  )}
                </>
              )

              return isLive ? (
                <a
                  key={tool.id}
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${cardClassName} cursor-pointer`}
                >
                  {cardBody}
                </a>
              ) : (
                <div key={tool.id} className={cardClassName}>
                  {cardBody}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Full-width photo gallery ── */}
        <PhotoGallery />
      </main>
    </div>
  )
}
