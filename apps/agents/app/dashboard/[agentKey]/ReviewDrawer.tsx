'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check, Copy, GitCompare, Lightbulb, Loader2, Plus, RefreshCw, RotateCcw, Trash2, X,
} from 'lucide-react'
import NewVersionPicker from './NewVersionPicker'
import {
  CARD, FindingVerdict, IssueRow, ReviewDTO, TEAL, TEAL_2, VERDICT_META, VERDICT_ORDER, Verdict,
  fmtDateTime, followupAsText, issuesAsText,
} from './dogMeta'

/** An 'analyzing' older than this is a dead serverless function, not a live run. */
const STUCK_AFTER_MS = 6 * 60 * 1000

// The findings table — this is the deliverable. Every cell is editable; dropping a
// finding keeps it on the record (it is the learning signal) but takes it out of
// the letter. "העתק למייל" produces the text to send; no file is generated.
export default function ReviewDrawer({
  agentKey,
  reviewId,
  onClose,
  onSaved,
  onOpenReview,
}: {
  agentKey: string
  reviewId: string
  onClose: () => void
  onSaved: () => void
  /** swap the drawer to another round once a follow-up finishes */
  onOpenReview?: (reviewId: string) => void
}) {
  const [review, setReview] = useState<ReviewDTO | null>(null)
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [verdicts, setVerdicts] = useState<FindingVerdict[]>([])
  const [versionOpen, setVersionOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  // The polling callbacks need the live dirty flag without re-subscribing.
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  const verifyFired = useRef(false)

  /**
   * Fold a fresh server copy into the drawer. When the user has unsaved edits,
   * only the server-owned verification fields are merged in (by index) — the
   * verify pass finishing must never clobber an edited letter.
   */
  const applyServer = useCallback((r: ReviewDTO) => {
    setReview(r)
    if (!dirtyRef.current) {
      setIssues(r.issues ?? [])
      setVerdicts(r.verdicts ?? [])
      return
    }
    setIssues((rows) =>
      rows.map((row, i) => {
        const src = r.issues?.[i]
        return src ? { ...row, verification: src.verification, verificationNote: src.verificationNote } : row
      })
    )
    setVerdicts((rows) =>
      rows.map((row, i) => {
        const src = r.verdicts?.[i]
        return src ? { ...row, verification: src.verification, verificationNote: src.verificationNote } : row
      })
    )
  }, [])

  /** Silent refresh — used by polling, where a transient failure is just skipped. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}`, { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      applyServer(d.review)
    } catch {
      /* transient */
    }
  }, [agentKey, reviewId, applyServer])

  useEffect(() => {
    let cancelled = false
    setReview(null)
    setDirty(false)
    setFeedback(null)
    verifyFired.current = false
    ;(async () => {
      try {
        const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}`, { cache: 'no-store' })
        const d = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(d.error ?? 'טעינת הבדיקה נכשלה'); return }
        applyServer(d.review)
      } catch {
        if (!cancelled) setError('טעינת הבדיקה נכשלה')
      }
    })()
    return () => { cancelled = true }
  }, [agentKey, reviewId, applyServer])

  const status = review?.status
  const verifyStatus = review?.verifyStatus ?? null

  // Poll while the analysis or the verification pass is in flight, and tick the
  // elapsed clock so the analyzing card counts up.
  useEffect(() => {
    const busy = status === 'analyzing' || verifyStatus === 'pending' || verifyStatus === 'running'
    if (!busy || retrying) return
    const poll = setInterval(refresh, 10_000)
    const tick = setInterval(() => setNow(Date.now()), 5_000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [status, verifyStatus, retrying, refresh])

  // Fire the evidence-verification pass once, as soon as a review lands ready.
  const runVerify = useCallback(async (force: boolean) => {
    setReview((r) => (r ? { ...r, verifyStatus: 'running', verifyError: null } : r))
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) applyServer(d.review)
      else if (res.status !== 409)
        setReview((r) => (r ? { ...r, verifyStatus: 'error', verifyError: d.error ?? 'האימות נכשל' } : r))
      // 409 = already running elsewhere; the poll picks the result up.
    } catch {
      /* connection dropped mid-run — the poll picks the result up */
    }
  }, [agentKey, reviewId, applyServer])

  useEffect(() => {
    if (status !== 'ready' || verifyStatus !== 'pending' || verifyFired.current) return
    verifyFired.current = true
    runVerify(false)
  }, [status, verifyStatus, runVerify])

  function requestClose() {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?')) return
    onClose()
  }

  async function deleteReview() {
    if (!window.confirm('למחוק את הבדיקה הזו לצמיתות?')) return
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}`, { method: 'DELETE' })
      if (!res.ok) { setError('המחיקה נכשלה'); return }
      onSaved()
      onClose()
    } catch {
      setError('המחיקה נכשלה')
    }
  }

  async function retry() {
    setRetrying(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}/retry`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'ההרצה החוזרת נכשלה'); return }
      onSaved()
      onOpenReview?.(d.review.id)
    } catch {
      setError('ההרצה החוזרת נכשלה')
    } finally {
      setRetrying(false)
    }
  }

  function patch(idx: number, field: keyof IssueRow, value: string | boolean) {
    setIssues((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
    setDirty(true)
  }

  function patchNote(idx: number, noteIdx: number, value: string) {
    setIssues((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r
        const notes = Array.from({ length: prevLabels.length }, (_, n) => r.prevNotes?.[n] ?? '')
        notes[noteIdx] = value
        return { ...r, prevNotes: notes }
      })
    )
    setDirty(true)
  }

  function addRow() {
    setIssues((rows) => [
      ...rows,
      { page: '', section: '', description: '', fix: '', prevNotes: prevLabels.map(() => '') },
    ])
    setDirty(true)
  }

  function removeRow(idx: number) {
    setIssues((rows) => rows.filter((_, i) => i !== idx))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues, verdicts: isFollowup ? verdicts : undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'השמירה נכשלה'); return }
      setDirty(false)
      dirtyRef.current = false
      applyServer(d.review)
      onSaved()
    } catch {
      setError('השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function copyForEmail() {
    if (!review) return
    // A follow-up round sends a different letter: what closed, what is still
    // open, and what the revision introduced.
    const text = isFollowup
      ? followupAsText({ projectName: review.projectName, round: review.round, verdicts, issues })
      : issuesAsText({ projectName: review.projectName, issues })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('ההעתקה נחסמה על ידי הדפדפן — סמנו את הטקסט והעתיקו ידנית.')
    }
  }

  function patchVerdict(idx: number, field: keyof FindingVerdict, value: string | boolean) {
    setVerdicts((rows) => rows.map((v, i) => (i === idx ? { ...v, [field]: value } : v)))
    setDirty(true)
  }

  // ── "שפר להבא": free-text feedback distilled into a durable guidance line ──

  function openFeedback(kind: 'issue' | 'verdict', index: number) {
    setFeedback({ kind, index, text: '', suggested: '', phase: 'input', error: null })
  }

  async function distillFeedback() {
    if (!feedback || !feedback.text.trim()) return
    setFeedback((f) => (f ? { ...f, phase: 'loading', error: null } : f))
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, kind: feedback.kind, index: feedback.index, text: feedback.text }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback((f) => (f ? { ...f, phase: 'input', error: d.error ?? 'ניסוח ההנחיה נכשל' } : f))
        return
      }
      setFeedback((f) => (f ? { ...f, phase: 'confirm', suggested: d.suggested } : f))
    } catch {
      setFeedback((f) => (f ? { ...f, phase: 'input', error: 'ניסוח ההנחיה נכשל' } : f))
    }
  }

  async function saveFeedback() {
    if (!feedback || !feedback.suggested.trim()) return
    setFeedback((f) => (f ? { ...f, phase: 'saving', error: null } : f))
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/guidance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: feedback.suggested.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setFeedback((f) => (f ? { ...f, phase: 'confirm', error: d.error ?? 'השמירה נכשלה' } : f))
        return
      }
      setFeedback((f) => (f ? { ...f, phase: 'saved' } : f))
      setTimeout(() => setFeedback(null), 2200)
    } catch {
      setFeedback((f) => (f ? { ...f, phase: 'confirm', error: 'השמירה נכשלה' } : f))
    }
  }

  const kept = issues.filter((i) => !i.dropped).length
  const prevLabels = review?.previousLabels ?? []
  const isFollowup = (review?.round ?? 1) > 1
  const openVerdicts = verdicts.filter((v) => !v.dropped)
  const resolvedCount = openVerdicts.filter((v) => VERDICT_META[v.verdict].resolved).length
  const ready = review?.status === 'ready'
  const verifying = ready && (verifyStatus === 'pending' || verifyStatus === 'running')
  const stuck = review?.status === 'analyzing' && now - Date.parse(review.updatedAt) > STUCK_AFTER_MS
  const elapsedMin = review ? Math.max(0, Math.floor((now - Date.parse(review.createdAt)) / 60000)) : 0

  return (
    <div className="fixed inset-0 z-40 flex justify-start" style={{ background: 'rgba(15,23,42,.35)' }} onClick={requestClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fbfdfd', width: 900, maxWidth: '96vw', height: '100%', overflowY: 'auto', padding: '22px 26px 60px', boxShadow: '-8px 0 30px rgba(15,118,110,.12)' }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="flex items-center gap-2.5" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {review?.projectName ?? '…'}
              {isFollowup && (
                <span style={{ fontSize: 12, fontWeight: 700, color: TEAL, background: '#e6f5f3', padding: '4px 10px', borderRadius: 999 }}>
                  גרסה {review?.round}
                </span>
              )}
            </h2>
            {review && (
              <div style={{ fontSize: 12.5, color: '#8a9391', marginTop: 4 }}>
                {isFollowup
                  ? `${review.agreementName} · מול ${review.previousAgreementName ?? 'הגרסה הקודמת'}`
                  : `${review.agreementName} · מול ${review.quoteName}`}
                {' · '}{fmtDateTime(review.createdAt)}
                {prevLabels.length > 0 && ` · הושווה ל-${prevLabels.length} הסכמים קודמים`}
              </div>
            )}
          </div>
          <button onClick={requestClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9aa0ac' }}>
            <X size={19} />
          </button>
        </div>

        {!review && !error && (
          <div className="flex items-center gap-2" style={{ ...CARD, padding: 26, fontSize: 14, color: '#8a9391' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: TEAL }} /> טוען את הבדיקה…
          </div>
        )}

        {/* Analysis still running (or dead): no findings to show yet. */}
        {review?.status === 'analyzing' && (
          <div style={{ ...CARD, padding: '30px 26px', textAlign: 'center' }}>
            {!stuck ? (
              <>
                <Loader2 size={26} className="animate-spin" style={{ color: TEAL, margin: '0 auto 12px' }} />
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>🐕 כלב קורא את המסמכים…</div>
                <div style={{ fontSize: 13, color: '#8a9391', lineHeight: 1.7 }}>
                  {elapsedMin < 1 ? 'הבדיקה התחילה הרגע' : `עברו ${elapsedMin} דקות`} · בדיקה אורכת בדרך כלל 2–4 דקות.
                  <br />
                  אפשר לסגור את החלון — הבדיקה תמשיך ברקע ותתעדכן ברשימה.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, color: '#b42318' }}>נראה שהבדיקה נתקעה</div>
                <div style={{ fontSize: 13, color: '#8a9391', marginBottom: 16 }}>
                  עברו {elapsedMin} דקות בלי עדכון — כנראה שהריצה מתה באמצע. אפשר להריץ שוב או למחוק.
                </div>
                <div className="flex items-center justify-center gap-2.5">
                  <RetryButton retrying={retrying} onClick={retry} />
                  <DeleteButton onClick={deleteReview} />
                </div>
              </>
            )}
          </div>
        )}

        {review?.status === 'error' && (
          <div style={{ fontSize: 13, color: '#b42318', background: '#fef3f2', border: '1px solid #fee4e2', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ marginBottom: 10 }}>{review.error}</div>
            <div className="flex items-center gap-2.5">
              <RetryButton retrying={retrying} onClick={retry} />
              <DeleteButton onClick={deleteReview} />
            </div>
          </div>
        )}

        {/* actions */}
        {ready && (
          <div className="flex items-center gap-2.5 mb-4 flex-wrap">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-2 font-bold text-white"
              style={{ border: 'none', borderRadius: 11, padding: '10px 16px', fontSize: 13.5, fontFamily: 'inherit', cursor: dirty && !saving ? 'pointer' : 'default', background: dirty && !saving ? `linear-gradient(135deg,${TEAL},${TEAL_2})` : '#cbd5d3' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור שינויים
            </button>
            <button
              onClick={copyForEmail}
              className="flex items-center gap-2 font-bold"
              style={{ border: '1px solid #d7e6e4', borderRadius: 11, padding: '10px 16px', fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: TEAL, cursor: 'pointer' }}
            >
              <Copy size={14} /> {copied ? 'הועתק!' : 'העתק למייל'}
            </button>
            <button
              onClick={addRow}
              className="flex items-center gap-2 font-bold"
              style={{ border: '1px solid #d7e6e4', borderRadius: 11, padding: '10px 16px', fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: TEAL, cursor: 'pointer' }}
            >
              <Plus size={14} /> ממצא ידני
            </button>
            <button
              onClick={() => setVersionOpen(true)}
              disabled={dirty}
              title={dirty ? 'שמרו את השינויים קודם — הבדיקה רצה על הגרסה השמורה של ההערות' : undefined}
              className="flex items-center gap-2 font-bold"
              style={{ border: '1px solid #d7e6e4', borderRadius: 11, padding: '10px 16px', fontSize: 13.5, fontFamily: 'inherit', background: dirty ? '#f3f6f5' : '#fff', color: dirty ? '#a9adb8' : TEAL, cursor: dirty ? 'default' : 'pointer' }}
            >
              <GitCompare size={14} /> בדוק גרסה חדשה
            </button>
            {verifying && (
              <span className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700, color: '#b54708', background: '#fffaeb', border: '1px solid #fedf89', padding: '6px 12px', borderRadius: 999 }}>
                <Loader2 size={12} className="animate-spin" /> מאמת ממצאים…
              </span>
            )}
            <span style={{ fontSize: 12.5, color: '#8a9391', marginRight: 'auto' }}>
              {kept} {isFollowup ? 'ממצאים חדשים' : 'ממצאים'} במכתב{issues.length !== kept ? ` · ${issues.length - kept} הוסרו` : ''}
            </span>
          </div>
        )}

        {ready && verifyStatus === 'error' && (
          <div className="flex items-center gap-3" style={{ fontSize: 13, color: '#b54708', background: '#fffaeb', border: '1px solid #fedf89', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            <span className="flex-1">אימות הממצאים נכשל: {review?.verifyError ?? 'שגיאה לא ידועה'}</span>
            <button
              onClick={() => runVerify(true)}
              className="flex items-center gap-1.5 font-bold"
              style={{ border: '1px solid #fedf89', borderRadius: 9, padding: '6px 12px', fontSize: 12.5, fontFamily: 'inherit', background: '#fff', color: '#b54708', cursor: 'pointer', flex: 'none' }}
            >
              <RefreshCw size={12} /> הרץ אימות שוב
            </button>
          </div>
        )}

        {/* Follow-up round: the agenda of comments we sent, each with a verdict. */}
        {ready && isFollowup && openVerdicts.length > 0 && (
          <div style={{ ...CARD, padding: '16px 18px', marginBottom: 14 }}>
            <div className="flex items-baseline gap-2 mb-3">
              <span style={{ fontSize: 22, fontWeight: 800, color: TEAL }}>
                {resolvedCount}/{openVerdicts.length}
              </span>
              <span style={{ fontSize: 13.5, color: '#5a5f6e', fontWeight: 600 }}>מההערות ששלחנו טופלו</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {VERDICT_ORDER.map((v) => {
                const n = openVerdicts.filter((x) => x.verdict === v).length
                if (!n) return null
                const m = VERDICT_META[v]
                return (
                  <span key={v} style={{ fontSize: 12, fontWeight: 700, color: m.color, background: `${m.color}1a`, padding: '4px 11px', borderRadius: 999 }}>
                    {m.label} {n}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {ready && isFollowup && verdicts.map((v, i) => (
          <VerdictRow
            key={i}
            index={i}
            verdict={v}
            onPatch={(field, value) => patchVerdict(i, field, value)}
            onFeedback={() => openFeedback('verdict', i)}
            feedbackPanel={
              feedback && feedback.kind === 'verdict' && feedback.index === i ? (
                <FeedbackPanel
                  fb={feedback}
                  onChange={setFeedback}
                  onDistill={distillFeedback}
                  onSave={saveFeedback}
                  onCancel={() => setFeedback(null)}
                />
              ) : null
            }
          />
        ))}

        {ready && isFollowup && issues.length > 0 && (
          <h3 style={{ margin: '22px 0 10px', fontSize: 15, fontWeight: 800 }}>
            ממצאים חדשים בגרסה הזו
          </h3>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#b42318', marginBottom: 12 }}>{error}</div>
        )}

        {ready && issues.length === 0 && (
          <div style={{ ...CARD, padding: 26, fontSize: 14, color: '#8a9391' }}>
            {isFollowup
              ? 'הגרסה החדשה לא הוסיפה בעיות בנושאים שבצ׳קליסט.'
              : 'לא נמצאו ממצאים בנושאים שבצ׳קליסט — ההסכם תואם את ההצעה בכל מה שנבדק.'}
          </div>
        )}

        {ready && issues.map((issue, i) => (
          <div
            key={i}
            style={{ ...CARD, padding: '16px 18px', marginBottom: 12, opacity: issue.dropped ? 0.5 : 1 }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span className="flex items-center justify-center font-extrabold" style={{ width: 26, height: 26, borderRadius: 8, background: '#e6f5f3', color: TEAL, fontSize: 12.5, flex: 'none' }}>
                {i + 1}
              </span>
              <Field label="עמוד" value={issue.page} onChange={(v) => patch(i, 'page', v)} width={70} />
              <Field label="סעיף" value={issue.section} onChange={(v) => patch(i, 'section', v)} width={130} />
              {issue.verification === 'suspect' && <SuspectBadge note={issue.verificationNote} />}
              <button
                onClick={() => openFeedback('issue', i)}
                title="שפר להבא — נסחו משוב שיהפוך להנחיה קבועה"
                className="flex items-center gap-1.5"
                style={{ marginRight: 'auto', border: '1px solid #e6efee', background: '#fff', borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', color: '#8a9391', cursor: 'pointer' }}
              >
                <Lightbulb size={12} /> שפר להבא
              </button>
              <button
                onClick={() => patch(i, 'dropped', !issue.dropped)}
                title={issue.dropped ? 'החזר למכתב' : 'הסר מהמכתב'}
                style={{ border: '1px solid #e6efee', background: '#fff', borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', color: issue.dropped ? TEAL : '#8a9391', cursor: 'pointer' }}
              >
                {issue.dropped ? <RotateCcw size={12} /> : 'הסר'}
              </button>
              <button
                onClick={() => removeRow(i)}
                title="מחק לגמרי"
                style={{ border: 'none', background: 'transparent', color: '#c9ced8', cursor: 'pointer' }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {feedback && feedback.kind === 'issue' && feedback.index === i && (
              <FeedbackPanel
                fb={feedback}
                onChange={setFeedback}
                onDistill={distillFeedback}
                onSave={saveFeedback}
                onCancel={() => setFeedback(null)}
              />
            )}

            <Area label="הבעיה" value={issue.description} onChange={(v) => patch(i, 'description', v)} />
            <Area label="תיקון מוצע" value={issue.fix} onChange={(v) => patch(i, 'fix', v)} />

            {/* The old report's X1/X2/X3 columns: how this same clause stood in
                each contract we already signed with this client. */}
            {prevLabels.length > 0 && (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${prevLabels.length},1fr)`, marginTop: 4 }}>
                {prevLabels.map((label, n) => (
                  <div key={n} style={{ background: '#f7fbfa', border: '1px solid #eef4f3', borderRadius: 9, padding: '7px 9px' }}>
                    <div title={label} style={{ fontSize: 11, color: '#a9adb8', fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </div>
                    <input
                      value={issue.prevNotes?.[n] ?? ''}
                      onChange={(e) => patchNote(i, n, e.target.value)}
                      placeholder="—"
                      style={{ width: '100%', fontSize: 12.5, fontFamily: 'inherit', padding: '4px 6px', borderRadius: 7, border: '1px solid #e6efee', background: '#fff' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {versionOpen && review && (
        <NewVersionPicker
          agentKey={agentKey}
          reviewId={review.id}
          projectName={review.projectName}
          onClose={() => setVersionOpen(false)}
          onCreated={(id) => { setVersionOpen(false); onOpenReview?.(id) }}
        />
      )}
    </div>
  )
}

// ── "שפר להבא" ────────────────────────────────────────────────────────────────

interface FeedbackState {
  kind: 'issue' | 'verdict'
  index: number
  /** the user's raw feedback */
  text: string
  /** the distilled guidance line, editable before saving */
  suggested: string
  phase: 'input' | 'loading' | 'confirm' | 'saving' | 'saved'
  error: string | null
}

/**
 * The two-step feedback flow: raw feedback in, a distilled guidance line back
 * for approval. Nothing is stored until the user explicitly saves — the line
 * then joins the guidance that opens every future review prompt.
 */
function FeedbackPanel({
  fb,
  onChange,
  onDistill,
  onSave,
  onCancel,
}: {
  fb: FeedbackState
  onChange: (f: FeedbackState | null) => void
  onDistill: () => void
  onSave: () => void
  onCancel: () => void
}) {
  const busy = fb.phase === 'loading' || fb.phase === 'saving'
  return (
    <div style={{ background: '#fbfaf3', border: '1px solid #efe9cf', borderRadius: 11, padding: '12px 14px', marginBottom: 10 }}>
      {fb.phase === 'saved' ? (
        <div className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
          <Check size={14} /> נשמר — כלב יזכור את זה מהבדיקה הבאה.
        </div>
      ) : fb.phase === 'input' || fb.phase === 'loading' ? (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#8a7f4c', marginBottom: 6 }}>שפר להבא</div>
          <textarea
            value={fb.text}
            onChange={(e) => onChange({ ...fb, text: e.target.value })}
            placeholder="מה כלב פספס או ניסח לא נכון כאן? למשל: אל תדווח על סעיף כזה כשההצעה כבר מכסה אותו"
            rows={2}
            disabled={busy}
            autoFocus
            style={{ width: '100%', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', padding: '8px 10px', borderRadius: 9, border: '1px solid #efe9cf', background: '#fff', resize: 'vertical' }}
          />
          {fb.error && <div style={{ fontSize: 12.5, color: '#b42318', marginTop: 6 }}>{fb.error}</div>}
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <button
              onClick={onDistill}
              disabled={busy || !fb.text.trim()}
              className="flex items-center gap-1.5 font-bold text-white"
              style={{ border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontFamily: 'inherit', cursor: busy || !fb.text.trim() ? 'default' : 'pointer', background: busy || !fb.text.trim() ? '#cbd5d3' : TEAL }}
            >
              {fb.phase === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />} נסח הנחיה
            </button>
            <button onClick={onCancel} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 12.5, fontFamily: 'inherit', color: '#8a9391', cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#8a7f4c', marginBottom: 6 }}>
            כך כלב יזכור את זה בבדיקות הבאות — אפשר לערוך לפני שמירה:
          </div>
          <textarea
            value={fb.suggested}
            onChange={(e) => onChange({ ...fb, suggested: e.target.value })}
            rows={2}
            disabled={busy}
            style={{ width: '100%', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', padding: '8px 10px', borderRadius: 9, border: '1px solid #efe9cf', background: '#fff', resize: 'vertical' }}
          />
          {fb.error && <div style={{ fontSize: 12.5, color: '#b42318', marginTop: 6 }}>{fb.error}</div>}
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <button
              onClick={onSave}
              disabled={busy || !fb.suggested.trim()}
              className="flex items-center gap-1.5 font-bold text-white"
              style={{ border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontFamily: 'inherit', cursor: busy || !fb.suggested.trim() ? 'default' : 'pointer', background: busy || !fb.suggested.trim() ? '#cbd5d3' : TEAL }}
            >
              {fb.phase === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} שמור הנחיה
            </button>
            <button
              onClick={() => onChange({ ...fb, phase: 'input', error: null })}
              disabled={busy}
              style={{ border: 'none', background: 'transparent', fontSize: 12.5, fontFamily: 'inherit', color: '#8a9391', cursor: 'pointer' }}
            >
              נסח מחדש
            </button>
            <button onClick={onCancel} disabled={busy} style={{ border: 'none', background: 'transparent', fontSize: 12.5, fontFamily: 'inherit', color: '#8a9391', cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** A finding the verification pass could not anchor in the document. */
function SuspectBadge({ note }: { note?: string }) {
  return (
    <span
      title={note || 'האימות לא הצליח לעגן את הממצא במסמך'}
      style={{ fontSize: 11.5, fontWeight: 700, color: '#b54708', background: '#fffaeb', border: '1px solid #fedf89', padding: '3px 9px', borderRadius: 999, flex: 'none', cursor: 'help' }}
    >
      ⚠ לא אומת
    </span>
  )
}

function RetryButton({ retrying, onClick }: { retrying: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={retrying}
      className="flex items-center gap-1.5 font-bold text-white"
      style={{ border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 13, fontFamily: 'inherit', cursor: retrying ? 'default' : 'pointer', background: retrying ? '#cbd5d3' : `linear-gradient(135deg,${TEAL},${TEAL_2})` }}
    >
      {retrying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {retrying ? 'מריץ מחדש… (עד כמה דקות)' : 'הרץ שוב'}
    </button>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 font-bold"
      style={{ border: '1px solid #fecdca', borderRadius: 10, padding: '9px 15px', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#b42318', cursor: 'pointer' }}
    >
      <Trash2 size={13} /> מחק בדיקה
    </button>
  )
}

/**
 * One comment we sent, and what became of it. The evidence quote is the point of
 * the row: a verdict of "תוקן" you can't check against the new wording is worth
 * nothing, so it is shown as a quotation rather than tucked away.
 */
function VerdictRow({
  index,
  verdict: v,
  onPatch,
  onFeedback,
  feedbackPanel,
}: {
  index: number
  verdict: FindingVerdict
  onPatch: (field: keyof FindingVerdict, value: string | boolean) => void
  onFeedback: () => void
  feedbackPanel?: React.ReactNode
}) {
  const meta = VERDICT_META[v.verdict]
  const where = [v.newPage && `עמוד ${v.newPage}`, v.newSection && `סעיף ${v.newSection}`].filter(Boolean).join(', ')

  return (
    <div style={{ ...CARD, padding: '16px 18px', marginBottom: 12, opacity: v.dropped ? 0.5 : 1, borderRight: `3px solid ${meta.color}` }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="flex items-center justify-center font-extrabold" style={{ width: 26, height: 26, borderRadius: 8, background: '#f1f5f4', color: '#5a5f6e', fontSize: 12.5, flex: 'none' }}>
          {index + 1}
        </span>
        <select
          value={v.verdict}
          onChange={(e) => onPatch('verdict', e.target.value as Verdict)}
          style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}55`, borderRadius: 999, padding: '5px 11px' }}
        >
          {VERDICT_ORDER.map((k) => (
            <option key={k} value={k} style={{ color: '#1f2430', background: '#fff' }}>{VERDICT_META[k].label}</option>
          ))}
        </select>
        {where && <span style={{ fontSize: 11.5, color: '#a9adb8' }}>בגרסה החדשה: {where}</span>}
        {v.verification === 'suspect' && <SuspectBadge note={v.verificationNote} />}
        <button
          onClick={onFeedback}
          title="שפר להבא — נסחו משוב שיהפוך להנחיה קבועה"
          className="flex items-center gap-1.5"
          style={{ marginRight: 'auto', border: '1px solid #e6efee', background: '#fff', borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', color: '#8a9391', cursor: 'pointer' }}
        >
          <Lightbulb size={12} /> שפר להבא
        </button>
        <button
          onClick={() => onPatch('dropped', !v.dropped)}
          title={v.dropped ? 'החזר למכתב' : 'הסר מהמכתב'}
          style={{ border: '1px solid #e6efee', background: '#fff', borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', color: v.dropped ? TEAL : '#8a9391', cursor: 'pointer' }}
        >
          {v.dropped ? <RotateCcw size={12} /> : 'הסר'}
        </button>
      </div>

      {feedbackPanel}

      <div style={{ fontSize: 11.5, color: '#a9adb8', fontWeight: 700, marginBottom: 3 }}>
        ההערה ששלחנו {v.source.section ? `(סעיף ${v.source.section})` : ''}
      </div>
      <div style={{ fontSize: 13, color: '#5a5f6e', lineHeight: 1.6, marginBottom: 9 }}>{v.source.description}</div>

      {v.evidence && (
        <blockquote style={{ margin: '0 0 9px', padding: '9px 12px', background: '#f7fbfa', borderRight: `3px solid ${TEAL_2}`, borderRadius: 8, fontSize: 12.5, lineHeight: 1.65, color: '#3a3f4d' }}>
          <div style={{ fontSize: 11, color: '#a9adb8', fontWeight: 700, marginBottom: 3 }}>הנוסח בגרסה החדשה</div>
          {v.evidence}
        </blockquote>
      )}

      {v.note && <div style={{ fontSize: 13, color: '#3a3f4d', lineHeight: 1.6, marginBottom: 8 }}>{v.note}</div>}

      <div style={{ fontSize: 11.5, color: '#a9adb8', fontWeight: 700, marginBottom: 4 }}>מה עדיין נדרש</div>
      <textarea
        value={v.remaining ?? ''}
        onChange={(e) => onPatch('remaining', e.target.value)}
        placeholder={meta.resolved ? 'טופל — אין דרישה נוספת' : '—'}
        rows={Math.min(6, Math.max(2, Math.ceil((v.remaining ?? '').length / 95)))}
        style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', padding: '9px 11px', borderRadius: 10, border: '1px solid #e6efee', background: '#fff', resize: 'vertical' }}
      />
    </div>
  )
}

function Field({ label, value, onChange, width }: { label: string; value: string; onChange: (v: string) => void; width: number }) {
  return (
    <label className="flex items-center gap-1.5">
      <span style={{ fontSize: 11.5, color: '#a9adb8', fontWeight: 700 }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width, fontSize: 13, fontFamily: 'inherit', padding: '5px 8px', borderRadius: 8, border: '1px solid #e6efee', background: '#fbfdfd' }}
      />
    </label>
  )
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11.5, color: '#a9adb8', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(10, Math.max(2, Math.ceil(value.length / 95)))}
        style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', padding: '9px 11px', borderRadius: 10, border: '1px solid #e6efee', background: '#fff', resize: 'vertical' }}
      />
    </div>
  )
}
