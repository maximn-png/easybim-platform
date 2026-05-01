import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, Zap, Globe, FileText } from 'lucide-react'

export default async function Home() {
  const { userId } = await auth()
  if (userId) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col overflow-hidden">

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <Image
          src="/easybim_logo-w.png"
          alt="EasyBIM"
          width={160}
          height={52}
          className="object-contain"
          priority
        />
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="px-5 py-2 rounded-xl text-[#1e248c] font-semibold text-sm hover:bg-[#1e248c]/10 transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up" className="px-5 py-2 rounded-xl bg-[#1e248c] text-white font-semibold text-sm hover:bg-[#1e248c]/90 transition-colors shadow-md shadow-[#1e248c]/20">
            Get Started Free
          </Link>
        </div>
      </header>

      {/* Background blobs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#44b8d3]/15 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-[#1e248c]/10 rounded-full blur-3xl -translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-[#44b8d3]/10 rounded-full blur-2xl pointer-events-none" />

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-16 flex-1">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#44b8d3]/10 border border-[#44b8d3]/30 text-[#1e248c] text-sm font-medium mb-8">
          <Sparkles size={14} className="text-[#44b8d3]" />
          AI-Powered Newsletter Generation
        </div>

        <h1 className="text-5xl md:text-6xl font-black text-[#1e248c] leading-tight max-w-3xl mb-4">
          Create Amazing<br />
          <span className="text-[#44b8d3]">BIM Newsletters</span>
        </h1>

        <p className="text-[#4b5563] text-lg max-w-xl mb-10 leading-relaxed">
          Transform RSS feeds into professional Hebrew newsletters with AI.<br />
          Powered by Gemini and Cohere, built for the BIM &amp; AEC industry.
        </p>

        <div className="flex items-center gap-4 flex-wrap justify-center">
          <Link href="/sign-up" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#1e248c] text-white font-bold text-base hover:bg-[#1e248c]/90 transition-all shadow-xl shadow-[#1e248c]/25 hover:shadow-[#1e248c]/40 hover:-translate-y-0.5">
            <Sparkles size={18} />
            Get Started Free
          </Link>
          <Link href="/sign-in" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border-2 border-[#1e248c]/20 text-[#1e248c] font-bold text-base hover:border-[#44b8d3] hover:text-[#44b8d3] transition-all">
            Sign In
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-20 max-w-4xl w-full">
          {[
            {
              icon: <Sparkles size={22} className="text-[#44b8d3]" />,
              title: 'AI-Powered',
              desc: 'Gemini and Cohere automatically curate, summarize, and write professional Hebrew content from BIM RSS feeds.',
            },
            {
              icon: <Zap size={22} className="text-[#44b8d3]" />,
              title: 'Lightning Fast',
              desc: 'Generate a full newsletter in under a minute. Real-time progress tracking with live status updates.',
            },
            {
              icon: <Globe size={22} className="text-[#44b8d3]" />,
              title: 'Smart Curation',
              desc: '21 BIM and AEC sources — Revit, IFC, AI in construction, MEP, and more. Filtered to what matters.',
            },
            {
              icon: <FileText size={22} className="text-[#44b8d3]" />,
              title: 'RTL Hebrew Output',
              desc: 'Fully styled HTML email in Hebrew, ready to send. Export to file or copy to clipboard in one click.',
            },
            {
              icon: <Sparkles size={22} className="text-[#44b8d3]" />,
              title: 'Your Voice',
              desc: 'Upload your LinkedIn posts to shape the tone. The AI writes in your style, not a generic one.',
            },
            {
              icon: <Zap size={22} className="text-[#44b8d3]" />,
              title: 'Always Fresh',
              desc: 'Configure how many days back to look. Every newsletter surfaces the latest industry news automatically.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white/70 backdrop-blur border border-white rounded-2xl p-6 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#44b8d3]/10 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-bold text-[#1e248c] text-base mb-2">{f.title}</h3>
              <p className="text-[#6b7280] text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-[#9ca3af] text-sm">
        © {new Date().getFullYear()} EasyBIM · AI Newsletter Platform
      </footer>
    </div>
  )
}
