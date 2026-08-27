import MyAnalyticsClient from '@/components/MyAnalyticsClient'

// Per-user page — everything on it depends on the signed-in user.
export const dynamic = 'force-dynamic'

export default function MyAnalyticsPage() {
  return (
    // epm-one-screen: locks the body to the viewport (≥1024px) — the charts and
    // table fill the remaining height and scroll internally instead.
    <div
      className="epm-one-screen flex-1 min-h-0 flex flex-col -mx-6 -my-6 px-6 py-4"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <MyAnalyticsClient />
    </div>
  )
}
