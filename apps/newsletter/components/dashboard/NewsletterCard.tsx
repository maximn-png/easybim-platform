import Link from 'next/link'
import { Eye, FileText, Sparkles } from 'lucide-react'

interface NewsletterCardProps {
  id: string
  title: string
  date: string
  topicCount: number
  llmProvider: string
  status: string
}

export default function NewsletterCard({ id, title, date, topicCount, llmProvider, status }: NewsletterCardProps) {
  const dateLabel = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <div className="bg-white rounded-2xl border border-[#e8eaff] p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col gap-4">

      {/* Top row */}
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
          status === 'ready'
            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
            : 'bg-amber-50 text-amber-600 border border-amber-200'
        }`}>
          {status === 'ready' ? 'Ready' : 'Draft'}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#f0f2ff] text-[#1e248c] font-semibold capitalize flex items-center gap-1">
          <Sparkles size={10} />
          {llmProvider}
        </span>
      </div>

      {/* Title */}
      <div>
        <h3 className="font-bold text-[#0a0a1a] text-sm leading-snug line-clamp-2">{title}</h3>
        <p className="text-xs text-[#9ca3af] mt-1">{dateLabel}</p>
      </div>

      {/* Topics count */}
      <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
        <FileText size={12} className="text-[#44b8d3]" />
        {topicCount} topics
      </div>

      {/* CTA */}
      <Link
        href={`/newsletter/${id}`}
        className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#f0f2ff] text-[#1e248c] font-semibold text-sm hover:bg-[#1e248c] hover:text-white transition-all"
      >
        <Eye size={14} /> View Newsletter
      </Link>
    </div>
  )
}
