'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowLeft, FileSearch, ListChecks, ScrollText, Sparkles } from 'lucide-react'
import type { AgentPresentation } from '@/lib/agents/presentation'
import HowItWorks from './HowItWorks'
import NewReviewPanel from './NewReviewPanel'
import ReviewDrawer from './ReviewDrawer'
import ChecklistEditor from './ChecklistEditor'
import { CARD, ReviewDTO, STATUS_META, TEAL, TEAL_2, fmtDateTime } from './dogMeta'

interface RunDTO {
  id: string
  pass: string
  trigger: string
  status: string
  summary: string | null
  error: string | null
  startedAt: string
}

export default function DogDashboard({
  agentKey,
  presentation: p,
}: {
  agentKey: string
  agentName: string
  description: string
  presentation: AgentPresentation
}) {
  const [reviews, setReviews] = useState<ReviewDTO[]>([])
  const [runs, setRuns] = useState<RunDTO[]>([])
  const [openReviewId, setOpenReviewId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [rev, run] = await Promise.all([
        fetch(`/api/dashboard/${agentKey}/reviews`, { cache: 'no-store' }),
        fetch(`/api/dashboard/${agentKey}/runs`, { cache: 'no-store' }),
      ])
      if (rev.ok) setReviews((await rev.json()).reviews ?? [])
      if (run.ok) setRuns((await run.json()).runs ?? [])
    } catch {
      /* transient */
    }
  }, [agentKey])

  useEffect(() => { load() }, [load])

  // Reviews run for minutes server-side; keep the list honest while any run or
  // verification pass is in flight (same interval pattern as RunHistory).
  const busy = reviews.some(
    (r) => r.status === 'analyzing' || r.verifyStatus === 'pending' || r.verifyStatus === 'running'
  )
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [busy, load])

  // A run finished while the tab was in the background? Refresh on return.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const openFindings = reviews.reduce((n, r) => n + (r.status === 'ready' ? r.openCount : 0), 0)
  const unedited = reviews.filter((r) => r.status === 'ready' && !r.edited).length

  const stats = [
    { label: 'בדיקות', value: reviews.length, icon: <ScrollText size={18} />, note: 'הסכמים שנבדקו' },
    { label: 'ממצאים פתוחים', value: openFindings, icon: <FileSearch size={18} />, note: 'בכל הבדיקות' },
    { label: 'ממתינות לסקירה', value: unedited, icon: <ListChecks size={18} />, note: 'עוד לא נגעתם בהן' },
  ]

  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Manrope','Assistant',system-ui,sans-serif", color: '#1f2430', background: 'linear-gradient(180deg,#f8fdfc 0%,#f1f7f6 100%)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 28px 60px' }}>

        <header className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 30, filter: 'drop-shadow(0 6px 14px rgba(15,118,110,.26))' }}>🐕</span>
            <div>
              <div className="flex items-center gap-2.5">
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Dog</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: TEAL, background: '#e6f5f3', padding: '4px 10px', borderRadius: 999 }}>{p.tagline}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#9aa0ac', fontWeight: 500, marginTop: 2 }}>
                <Link href="/" className="inline-flex items-center gap-1" style={{ color: '#9aa0ac' }}>
                  <ArrowLeft size={12} /> Agent Kingdom · Dashboard
                </Link>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setChecklistOpen(true)}
              className="flex items-center gap-2 font-bold"
              style={{ fontSize: 14, padding: '10px 16px', borderRadius: 12, border: '1px solid #d7e6e4', background: '#fff', color: TEAL, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <ListChecks size={16} /> מה כלב בודק
            </button>
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-2 text-white font-bold"
              style={{ fontSize: 14.5, padding: '11px 18px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: `linear-gradient(135deg,${TEAL},${TEAL_2})`, boxShadow: '0 10px 24px rgba(15,118,110,.3)' }}
            >
              <span style={{ fontSize: 19 }}>🐕</span> בדיקת הסכם
            </button>
          </div>
        </header>

        <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {stats.map((st) => (
            <div key={st.label} style={{ ...CARD, padding: '18px 20px' }}>
              <div className="flex items-center justify-between mb-3.5">
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#9aa0ac' }}>{st.label}</span>
                <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 11, background: '#e6f5f3', color: TEAL }}>{st.icon}</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{st.value}</div>
              <div style={{ fontSize: 12, color: '#a9adb8', marginTop: 10 }}>{st.note}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '1.62fr 1fr' }}>
          {/* reviews */}
          <div style={{ ...CARD, padding: '22px 24px 12px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>בדיקות הסכמים</h3>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#9aa0ac' }}>
              כל בדיקה משווה הסכם שהתקבל מהלקוח מול הצעת המחיר ששלחנו.
            </p>

            {reviews.length === 0 && (
              <p style={{ fontSize: 13.5, color: '#a9adb8', padding: '18px 0' }}>
                עוד לא נבדק אף הסכם. לחצו על &quot;בדיקת הסכם&quot; ובחרו תיקיית פרויקט.
              </p>
            )}

            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenReviewId(r.id)}
                dir="rtl"
                className="flex items-center gap-4 w-full text-right"
                style={{ padding: '13px 0', border: 'none', borderTop: '1px solid #f0f5f4', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span className="flex items-center justify-center font-extrabold" style={{ width: 34, height: 34, borderRadius: 10, background: '#e6f5f3', color: TEAL, fontSize: 13.5, flex: 'none' }}>
                  {r.status === 'ready' ? r.openCount : '–'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#2b2f3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.projectName}
                    </span>
                    {r.round > 1 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: TEAL, background: '#e6f5f3', padding: '2px 8px', borderRadius: 999, flex: 'none' }}>
                        גרסה {r.round}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#a9adb8', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.verdictCounts
                      ? `${(r.verdictCounts.fixed ?? 0) + (r.verdictCounts.removed ?? 0)} הערות טופלו · ${r.agreementName}`
                      : `${r.agreementName} · ${fmtDateTime(r.createdAt)}`}
                  </div>
                </div>
                {r.edited && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '4px 9px', borderRadius: 999 }}>נערך</span>
                )}
                {r.status === 'ready' && (r.verifyStatus === 'pending' || r.verifyStatus === 'running') && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#b54708', background: '#fffaeb', padding: '4px 9px', borderRadius: 999, flex: 'none' }}>מאמת…</span>
                )}
                <StatusPill status={r.status} />
              </button>
            ))}
          </div>

          {/* right rail */}
          <div className="flex flex-col gap-4">
            <div style={{ ...CARD, padding: '20px 22px' }}>
              <HowItWorks accent={TEAL} data={p.howItWorks} />
            </div>

            <div style={{ ...CARD, padding: '22px 24px 14px' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Activity size={16} style={{ color: TEAL }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Agent Activity</h3>
              </div>
              {runs.length === 0 && <p style={{ fontSize: 13, color: '#a9adb8', padding: '12px 0' }}>אין ריצות עדיין.</p>}
              {runs.slice(0, 5).map((r) => (
                <div key={r.id} className="flex gap-3" style={{ padding: '12px 0', borderTop: '1px solid #f0f5f4' }}>
                  <span className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 10, flex: 'none', background: r.status === 'error' ? '#fdecec' : '#e6f5f3', color: r.status === 'error' ? '#e5484d' : TEAL }}>
                    <Sparkles size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#3a3f4d', lineHeight: 1.4 }}>
                      {(r.summary ?? r.error ?? r.status).slice(0, 110)}
                    </div>
                    <div style={{ fontSize: 12, color: '#b0aebc', marginTop: 2 }}>{fmtDateTime(r.startedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {newOpen && (
        <NewReviewPanel
          agentKey={agentKey}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); setOpenReviewId(id); load() }}
        />
      )}
      {openReviewId && (
        <ReviewDrawer
          agentKey={agentKey}
          reviewId={openReviewId}
          onClose={() => { setOpenReviewId(null); load() }}
          onSaved={load}
          onOpenReview={(id) => { setOpenReviewId(id); load() }}
        />
      )}
      {checklistOpen && <ChecklistEditor agentKey={agentKey} onClose={() => setChecklistOpen(false)} />}
    </div>
  )
}

function StatusPill({ status }: { status: ReviewDTO['status'] }) {
  const m = STATUS_META[status]
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, color: m.color, background: `${m.color}1f`, padding: '4px 10px', borderRadius: 999, flex: 'none' }}>
      {m.label}
    </span>
  )
}
