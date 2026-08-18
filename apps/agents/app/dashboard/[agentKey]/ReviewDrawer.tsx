'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, GitCompare, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import NewVersionPicker from './NewVersionPicker'
import {
  CARD, FindingVerdict, IssueRow, ReviewDTO, TEAL, TEAL_2, VERDICT_META, VERDICT_ORDER, Verdict,
  fmtDateTime, followupAsText, issuesAsText,
} from './dogMeta'

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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}`, { cache: 'no-store' })
        const d = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(d.error ?? 'טעינת הבדיקה נכשלה'); return }
        setReview(d.review)
        setIssues(d.review.issues ?? [])
        setVerdicts(d.review.verdicts ?? [])
      } catch {
        if (!cancelled) setError('טעינת הבדיקה נכשלה')
      }
    })()
    return () => { cancelled = true }
  }, [agentKey, reviewId])

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
      setReview(d.review)
      setVerdicts(d.review.verdicts ?? [])
      setDirty(false)
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
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function patchVerdict(idx: number, field: keyof FindingVerdict, value: string | boolean) {
    setVerdicts((rows) => rows.map((v, i) => (i === idx ? { ...v, [field]: value } : v)))
    setDirty(true)
  }

  const kept = issues.filter((i) => !i.dropped).length
  const prevLabels = review?.previousLabels ?? []
  const isFollowup = (review?.round ?? 1) > 1
  const openVerdicts = verdicts.filter((v) => !v.dropped)
  const resolvedCount = openVerdicts.filter((v) => VERDICT_META[v.verdict].resolved).length

  return (
    <div className="fixed inset-0 z-40 flex justify-start" style={{ background: 'rgba(15,23,42,.35)' }} onClick={onClose}>
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
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9aa0ac' }}>
            <X size={19} />
          </button>
        </div>

        {review?.status === 'error' && (
          <div style={{ fontSize: 13, color: '#b42318', background: '#fef3f2', border: '1px solid #fee4e2', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            {review.error}
          </div>
        )}

        {/* actions */}
        <div className="flex items-center gap-2.5 mb-4">
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
          {review?.status === 'ready' && (
            <button
              onClick={() => setVersionOpen(true)}
              className="flex items-center gap-2 font-bold"
              style={{ border: '1px solid #d7e6e4', borderRadius: 11, padding: '10px 16px', fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: TEAL, cursor: 'pointer' }}
            >
              <GitCompare size={14} /> בדוק גרסה חדשה
            </button>
          )}
          <span style={{ fontSize: 12.5, color: '#8a9391', marginRight: 'auto' }}>
            {kept} {isFollowup ? 'ממצאים חדשים' : 'ממצאים'} במכתב{issues.length !== kept ? ` · ${issues.length - kept} הוסרו` : ''}
          </span>
        </div>

        {/* Follow-up round: the agenda of comments we sent, each with a verdict. */}
        {isFollowup && openVerdicts.length > 0 && (
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

        {isFollowup && verdicts.map((v, i) => (
          <VerdictRow
            key={i}
            index={i}
            verdict={v}
            onPatch={(field, value) => patchVerdict(i, field, value)}
          />
        ))}

        {isFollowup && issues.length > 0 && (
          <h3 style={{ margin: '22px 0 10px', fontSize: 15, fontWeight: 800 }}>
            ממצאים חדשים בגרסה הזו
          </h3>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#b42318', marginBottom: 12 }}>{error}</div>
        )}

        {issues.length === 0 && review?.status === 'ready' && (
          <div style={{ ...CARD, padding: 26, fontSize: 14, color: '#8a9391' }}>
            {isFollowup
              ? 'הגרסה החדשה לא הוסיפה בעיות בנושאים שבצ׳קליסט.'
              : 'לא נמצאו ממצאים בנושאים שבצ׳קליסט — ההסכם תואם את ההצעה בכל מה שנבדק.'}
          </div>
        )}

        {issues.map((issue, i) => (
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
              <button
                onClick={() => patch(i, 'dropped', !issue.dropped)}
                title={issue.dropped ? 'החזר למכתב' : 'הסר מהמכתב'}
                style={{ marginRight: 'auto', border: '1px solid #e6efee', background: '#fff', borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', color: issue.dropped ? TEAL : '#8a9391', cursor: 'pointer' }}
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

/**
 * One comment we sent, and what became of it. The evidence quote is the point of
 * the row: a verdict of "תוקן" you can't check against the new wording is worth
 * nothing, so it is shown as a quotation rather than tucked away.
 */
function VerdictRow({
  index,
  verdict: v,
  onPatch,
}: {
  index: number
  verdict: FindingVerdict
  onPatch: (field: keyof FindingVerdict, value: string | boolean) => void
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
        <button
          onClick={() => onPatch('dropped', !v.dropped)}
          title={v.dropped ? 'החזר למכתב' : 'הסר מהמכתב'}
          style={{ marginRight: 'auto', border: '1px solid #e6efee', background: '#fff', borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', color: v.dropped ? TEAL : '#8a9391', cursor: 'pointer' }}
        >
          {v.dropped ? <RotateCcw size={12} /> : 'הסר'}
        </button>
      </div>

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
