'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Sparkles, Zap, Globe } from 'lucide-react'
import CursorEffect from './CursorEffect'

// Static positions to avoid hydration mismatch
const PARTICLES = [
  { x: '8%',  y: '18%', size: 3, delay: '0s',    dur: '7s'   },
  { x: '88%', y: '12%', size: 2, delay: '1.2s',  dur: '8.5s' },
  { x: '72%', y: '68%', size: 4, delay: '2.1s',  dur: '6.5s' },
  { x: '18%', y: '78%', size: 2, delay: '0.7s',  dur: '9s'   },
  { x: '48%', y: '8%',  size: 3, delay: '3.3s',  dur: '7.5s' },
  { x: '92%', y: '52%', size: 2, delay: '1.8s',  dur: '8s'   },
  { x: '28%', y: '42%', size: 2, delay: '4.1s',  dur: '6s'   },
  { x: '62%', y: '88%', size: 3, delay: '2.8s',  dur: '7s'   },
  { x: '55%', y: '35%', size: 2, delay: '0.3s',  dur: '9.5s' },
  { x: '5%',  y: '55%', size: 3, delay: '5s',    dur: '7.5s' },
]

export default function LandingPage() {
  // Cursor-off class is managed by CursorEffect
  useEffect(() => {}, [])

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}>

      <CursorEffect />

      {/* ── Background depth layers ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-5%', right: '-8%', width: 700, height: 700, background: 'radial-gradient(circle, rgba(68,184,211,0.20) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '-8%', width: 620, height: 620, background: 'radial-gradient(circle, rgba(30,36,140,0.11) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', top: '42%', left: '42%', width: 480, height: 480, background: 'radial-gradient(circle, rgba(68,184,211,0.08) 0%, transparent 65%)', transform: 'translate(-50%,-50%)' }} />

        {/* Floating particles */}
        {PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: 'absolute', left: p.x, top: p.y,
            width: p.size, height: p.size, borderRadius: '50%',
            background: '#44b8d3',
            animation: `landing-float ${p.dur} ${p.delay} ease-in-out infinite`,
          }} />
        ))}
      </div>

      {/* ── Navigation ── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <Image src="/easybim_logo-w.png" alt="EasyBIM" width={180} height={58} priority className="object-contain" />
        <Link
          href="/sign-in"
          className="px-6 py-2.5 rounded-xl bg-[#1e248c] text-white text-sm font-bold transition-all duration-200 shadow-lg shadow-[#1e248c]/20 hover:bg-[#44b8d3] hover:shadow-[#44b8d3]/30 hover:-translate-y-0.5"
        >
          Sign In
        </Link>
      </nav>

      {/* ── Hero ── */}
      <main className="relative z-10 flex flex-col items-center text-center px-6 pt-12 pb-28">

        {/* Badge */}
        <div style={{ animation: 'landing-fade-up 0.6s 0s ease both' }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#44b8d3]/40 bg-[#44b8d3]/10 text-[#1e248c] text-xs font-semibold mb-10 shadow-sm"
        >
          <Sparkles size={12} className="text-[#44b8d3]" />
          AI-Powered Internal Tools Platform
        </div>

        {/* Headline */}
        <h1 style={{ animation: 'landing-fade-up 0.6s 0.1s ease both' }}
          className="text-5xl md:text-6xl font-black leading-[1.1] mb-6 max-w-3xl"
        >
          <span className="text-[#1e248c]">Welcome to the</span>
          <br />
          <span className="text-[#44b8d3]">EasyBIM Platform</span>
        </h1>

        {/* Sub-headline */}
        <p style={{ animation: 'landing-fade-up 0.6s 0.2s ease both' }}
          className="text-lg text-[#4b5563] max-w-xl mb-3 leading-relaxed"
        >
          Your all-in-one workspace for AI-powered BIM workflows — built exclusively
          for the EasyBIM team. Every tool you need is one click away.
        </p>
        <p style={{ animation: 'landing-fade-up 0.6s 0.3s ease both' }}
          className="text-sm text-[#1e248c]/70 font-semibold mb-12 tracking-wide"
        >
          ✦&nbsp;&nbsp;This is where the innovation happens&nbsp;&nbsp;✦
        </p>

        {/* CTA */}
        <div style={{ animation: 'landing-fade-up 0.6s 0.4s ease both' }}>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#1e248c] text-white font-bold text-base transition-all duration-300 shadow-xl shadow-[#1e248c]/25 hover:bg-[#44b8d3] hover:shadow-2xl hover:shadow-[#44b8d3]/30 hover:-translate-y-1 group"
          >
            <Sparkles size={16} />
            Enter the Platform
            <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        <p style={{ animation: 'landing-fade-up 0.6s 0.5s ease both' }}
          className="mt-5 text-xs text-[#9ca3af]"
        >
          Sign in with your{' '}
          <span className="text-[#1e248c] font-semibold">@easybim.co.il</span> account
        </p>

        {/* ── Bottom value strip ── */}
        <div style={{ animation: 'landing-fade-up 0.8s 0.65s ease both' }}
          className="flex items-center gap-10 mt-20 text-xs text-[#9ca3af]"
        >
          {[
            { icon: Zap,   label: 'Lightning Fast' },
            { icon: Globe, label: 'BIM & AEC Focused' },
            { icon: Sparkles, label: 'AI-Powered' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <Icon size={13} className="text-[#44b8d3]" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
