import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { connectDB } from '@/lib/db/mongoose'
import Newsletter from '@/lib/models/Newsletter'
import { buildNewsletterHtml } from '@/lib/services/newsletterService'
import NewsletterViewerClient from '@/components/newsletter/NewsletterViewerClient'
import AppHeader from '@/components/AppHeader'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewsletterPage({ params }: PageProps) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { id } = await params
  await connectDB()

  const raw = await Newsletter.findOne({ _id: id, userId }).lean()
  if (!raw) notFound()
  const newsletter = JSON.parse(JSON.stringify(raw))

  const nl = newsletter as {
    _id: string; title: string; date: string
    topics: Array<{ title: string; body: string; sourceUrl: string; sourceName: string; imageBase64?: string }>
    llmProvider: string; status: string
  }

  const htmlOutput = buildNewsletterHtml(nl.topics, new Date(nl.date))

  const dateLabel = new Date(nl.date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[#44b8d3]/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-[#1e248c]/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      <AppHeader />

      <main className="relative max-w-3xl mx-auto px-6 py-10">

        {/* Breadcrumb + meta */}
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#1e248c] transition-colors mb-4 font-medium">
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-black text-[#1e248c] leading-tight">{nl.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-sm text-[#6b7280]">{dateLabel}</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
              nl.status === 'ready'
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}>
              {nl.status === 'ready' ? 'Ready' : 'Draft'}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#f0f2ff] text-[#1e248c] font-semibold flex items-center gap-1 capitalize">
              <Sparkles size={10} /> {nl.llmProvider}
            </span>
          </div>
        </div>

        <NewsletterViewerClient
          htmlOutput={htmlOutput}
          topics={nl.topics}
          newsletterId={nl._id.toString()}
          date={nl.date}
        />
      </main>
    </div>
  )
}
