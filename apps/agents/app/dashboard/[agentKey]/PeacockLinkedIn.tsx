'use client'

import Link from 'next/link'
import { ArrowLeft, Eye, TrendingUp } from 'lucide-react'
import {
  compact, ImpressionsCard, LinkedInStatusRow, TopPostsCard, useAnalytics,
} from './PeacockAnalytics'
import { ACCENT, ACCENT_BG, CARD } from './postMeta'

// The LinkedIn numbers, on their own page.
//
// These cards are a read-after-the-fact: they say how what you already
// published performed, which is a different job from planning the next post.
// Keeping them on the dashboard pushed Posts & Timeline below the fold, so the
// dashboard keeps one Impressions stat tile and links here for the detail.
export default function PeacockLinkedIn({
  agentKey, onBack, onOpenPost,
}: {
  agentKey: string
  onBack: () => void
  /** Go back to the dashboard with one post's drawer open. */
  onOpenPost: (id: string) => void
}) {
  const { data, reload } = useAnalytics(agentKey)
  const rate = data?.engagementRate30d

  return (
    <div style={{ minHeight: '100vh', color: '#1f2430', background: 'linear-gradient(135deg,#f0f3ff 0%,#e7eefe 100%)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px 60px' }}>
        <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <Link href="/" className="hover:text-[#1e248c]">Agent Kingdom</Link>
              <span aria-hidden>›</span>
              <button onClick={onBack} className="hover:text-[#1e248c] cursor-pointer"
                style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', padding: 0 }}>
                Peacock
              </button>
              <span aria-hidden>›</span>
              <span className="text-[#1e248c] font-medium">LinkedIn</span>
            </div>
            <h1 className="text-3xl font-bold text-[#1e248c]">LinkedIn Performance</h1>
            <p className="text-gray-500 text-sm mt-1">
              How the published posts actually did — impressions over time, the strongest posts, and the account connection.
            </p>
          </div>
          <button onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 border border-white/90 text-[#1e248c] hover:bg-blue-50 transition-colors cursor-pointer">
            <ArrowLeft size={13} /> Dashboard
          </button>
        </header>

        {/* the two headline numbers, so the page states its point before the chart */}
        <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
          <Tile
            label="Impressions"
            value={data?.hasData ? compact(data.impressions30d) : '—'}
            note={data?.hasData ? 'last 30 days' : 'no numbers yet — import below'}
            icon={<Eye size={16} />}
          />
          <Tile
            label="Engagements"
            value={data?.hasData ? compact(data.engagements30d) : '—'}
            note={rate != null ? `last 30 days · ${rate.toFixed(1)}% of impressions` : 'last 30 days'}
            icon={<TrendingUp size={16} />}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <ImpressionsCard agentKey={agentKey} data={data} onImported={reload} />
            <LinkedInStatusRow agentKey={agentKey} data={data} onChanged={reload} />
          </div>
          <TopPostsCard data={data} onOpenPost={onOpenPost} />
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between" style={{ ...CARD, padding: '14px 18px' }}>
      <div>
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="text-2xl font-bold text-[#1e248c] mt-1" style={{ letterSpacing: '-.02em' }}>{value}</div>
        <div className="text-[11px] text-gray-400 mt-1">{note}</div>
      </div>
      <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: ACCENT_BG, color: ACCENT }}>
        {icon}
      </span>
    </div>
  )
}
