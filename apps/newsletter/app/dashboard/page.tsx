import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Sparkles } from 'lucide-react'
import { connectDB } from '@/lib/db/mongoose'
import Newsletter from '@/lib/models/Newsletter'
import NewsletterCard from '@/components/dashboard/NewsletterCard'
import StatsBar from '@/components/dashboard/StatsBar'
import AppHeader from '@/components/AppHeader'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  await connectDB()

  const newsletters = await Newsletter.find({ userId })
    .select('title date status llmProvider topics')
    .sort({ date: -1 })
    .limit(20)
    .allowDiskUse(true)
    .lean()

  const nlList = newsletters as unknown as Array<{
    _id: string; title: string; date: string
    status: string; llmProvider: string; topics: unknown[]
  }>

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Background blobs */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[#44b8d3]/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-[#1e248c]/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      <AppHeader />

      <main className="relative max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* Page title + CTA */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#44b8d3]/10 border border-[#44b8d3]/30 text-[#1e248c] text-xs font-semibold mb-3">
              <Sparkles size={12} className="text-[#44b8d3]" />
              AI Newsletter Platform
            </div>
            <h1 className="text-3xl font-black text-[#1e248c]">Your Newsletters</h1>
            <p className="text-[#6b7280] text-sm mt-1">Generate professional BIM content from 21 RSS sources</p>
          </div>
          <Link
            href="/generate"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1e248c] text-white font-bold text-sm hover:bg-[#1e248c]/90 transition-all shadow-lg shadow-[#1e248c]/20 hover:-translate-y-0.5"
          >
            <Plus size={16} /> Create Newsletter
          </Link>
        </div>

        {/* Stats */}
        <StatsBar totalNewsletters={nlList.length} lastGenDate={nlList[0]?.date} />

        {/* Grid */}
        <div>
          <h2 className="font-bold text-[#1e248c] text-lg mb-4">Recent Newsletters</h2>

          {nlList.length === 0 ? (
            <div className="bg-white/70 backdrop-blur border border-white rounded-2xl p-16 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1e248c] to-[#44b8d3] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[#1e248c]/25">
                <Sparkles size={28} className="text-white" />
              </div>
              <h3 className="font-bold text-[#1e248c] text-xl mb-2">No newsletters yet</h3>
              <p className="text-[#6b7280] text-sm mb-6 max-w-xs mx-auto">
                Generate your first AI-powered BIM newsletter in under a minute
              </p>
              <Link
                href="/generate"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1e248c] text-white font-bold text-sm hover:bg-[#1e248c]/90 transition-all shadow-md shadow-[#1e248c]/25"
              >
                <Plus size={16} /> Create First Newsletter
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {nlList.map((nl) => (
                <NewsletterCard
                  key={nl._id.toString()}
                  id={nl._id.toString()}
                  title={nl.title}
                  date={nl.date}
                  topicCount={nl.topics.length}
                  llmProvider={nl.llmProvider}
                  status={nl.status}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Mobile FAB */}
      <Link
        href="/generate"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#1e248c] text-white flex items-center justify-center shadow-xl shadow-[#1e248c]/30 md:hidden z-30 hover:bg-[#44b8d3] transition-colors"
      >
        <Plus size={24} />
      </Link>
    </div>
  )
}
