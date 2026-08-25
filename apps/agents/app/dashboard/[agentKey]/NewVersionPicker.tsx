'use client'

import { useEffect, useState } from 'react'
import { FileText, GitCompare, Loader2, X } from 'lucide-react'
import { CARD, FollowupCandidate, TEAL, TEAL_2, fmtDate } from './dogMeta'

/**
 * Step 3 of the loop: the client sent back a revised contract. Pick it, and Dog
 * decides — comment by comment — whether each one was actually fixed.
 * The version already reviewed is filtered out server-side, so it can't be
 * compared against itself.
 */
export default function NewVersionPicker({
  agentKey,
  reviewId,
  projectName,
  onClose,
  onCreated,
}: {
  agentKey: string
  reviewId: string
  projectName: string
  onClose: () => void
  onCreated: (reviewId: string) => void
}) {
  const [candidates, setCandidates] = useState<FollowupCandidate[]>([])
  const [agendaCount, setAgendaCount] = useState<number | null>(null)
  const [currentFileId, setCurrentFileId] = useState('')
  const [fileId, setFileId] = useState('')
  // Which file counts as "the previous version" is the user's call: the version
  // this round reviewed is only the default, and NONE is a valid choice.
  const [previousFileId, setPreviousFileId] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}/followup`, { cache: 'no-store' })
        const d = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(d.error ?? 'טעינת הקבצים נכשלה'); return }
        setCandidates(d.candidates ?? [])
        setAgendaCount(d.agendaCount ?? 0)
        setCurrentFileId(d.currentFileId ?? '')
        setPreviousFileId(d.currentFileId ?? '')
      } catch {
        if (!cancelled) setError('טעינת הקבצים נכשלה')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [agentKey, reviewId])

  async function run() {
    if (!fileId) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/reviews/${reviewId}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newVersionFileId: fileId, previousVersionFileId: previousFileId }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'הבדיקה נכשלה'); return }
      onCreated(d.review.id)
    } catch {
      setError('הבדיקה נכשלה — נסו שוב')
    } finally {
      setRunning(false)
    }
  }

  function requestClose() {
    if (running && !window.confirm('הבדיקה ממשיכה ברקע ותופיע ברשימה כשתסתיים. לסגור את החלון?')) return
    onClose()
  }

  return (
    // stopPropagation on the overlay too: this picker renders inside the
    // drawer's backdrop, and without it a backdrop click here would bubble up
    // and close the drawer as well.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,.45)' }}
      onClick={(e) => { e.stopPropagation(); if (!running) onClose() }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: 640, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', padding: '24px 26px' }}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="flex items-center gap-2" style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
            <GitCompare size={18} style={{ color: TEAL }} /> בדיקת גרסה מתוקנת
          </h2>
          <button onClick={requestClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9aa0ac' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#8a9391', lineHeight: 1.6 }}>
          {projectName} — כלב יעבור על {agendaCount ?? '…'} ההערות ששלחתם ויכריע לכל אחת אם היא אכן תוקנה בגרסה שהתקבלה,
          עם ציטוט מהנוסח החדש. במקביל הוא יסרוק את הגרסה החדשה ויאתר בעיות שנוספו בה.
        </p>

        {loading && (
          <div className="flex items-center gap-2" style={{ fontSize: 13, color: '#8a9391' }}>
            <Loader2 size={14} className="animate-spin" /> קורא את תיקיית החוזה…
          </div>
        )}

        {!loading && candidates.filter((c) => c.fileId !== currentFileId).length === 0 && !error && (
          <div style={{ fontSize: 13.5, color: '#b54708', background: '#fffaeb', border: '1px solid #fef0c7', borderRadius: 10, padding: '11px 13px' }}>
            אין בתיקיית &quot;חוזה&quot; קובץ נוסף מלבד הגרסה שכבר נבדקה. העלו את הגרסה המתוקנת לתיקייה ונסו שוב.
          </div>
        )}

        {candidates.length > 0 && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a5f6e', marginBottom: 7 }}>
              הגרסה החדשה שהתקבלה מהלקוח
            </div>
            <select
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              style={{ width: '100%', fontSize: 14, fontFamily: 'inherit', padding: '9px 10px', borderRadius: 10, border: '1px solid #e6efee', background: '#fbfdfd' }}
            >
              <option value="">— בחרו קובץ —</option>
              {candidates
                .filter((c) => c.fileId !== currentFileId)
                .map((c) => (
                  <option key={c.fileId} value={c.fileId}>{c.name}</option>
                ))}
            </select>
            {fileId && (
              <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: '#a9adb8', marginTop: 6 }}>
                <FileText size={12} /> עודכן {fmtDate(candidates.find((c) => c.fileId === fileId)?.modifiedTime ?? null)}
              </div>
            )}

            {/* You choose what it is compared against — including nothing. */}
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a5f6e', margin: '16px 0 7px' }}>
              להשוות מול
            </div>
            <select
              value={previousFileId}
              onChange={(e) => setPreviousFileId(e.target.value)}
              style={{ width: '100%', fontSize: 14, fontFamily: 'inherit', padding: '9px 10px', borderRadius: 10, border: '1px solid #e6efee', background: '#fbfdfd' }}
            >
              {candidates
                .filter((c) => c.fileId !== fileId)
                .map((c) => (
                  <option key={c.fileId} value={c.fileId}>
                    {c.name}{c.fileId === currentFileId ? '  (הגרסה שנבדקה)' : ''}
                  </option>
                ))}
              <option value="">בלי לצרף גרסה קודמת — מול ההערות בלבד</option>
            </select>
            <div style={{ fontSize: 11.5, color: '#a9adb8', marginTop: 6, lineHeight: 1.6 }}>
              {previousFileId
                ? 'כלב יראה את שתי הגרסאות ויוכל לזהות גם החמרות בנוסח. בדיקה יסודית ויקרה יותר.'
                : 'כלב יראה רק את הגרסה החדשה ויכריע מול הציטוטים שבתוך ההערות. זול ומהיר יותר, אך קשה לו לזהות החמרה בנוסח.'}
            </div>

            <button
              onClick={run}
              disabled={running || !fileId}
              className="flex items-center justify-center gap-2 w-full font-bold text-white"
              style={{
                marginTop: 18,
                padding: '13px 0',
                borderRadius: 13,
                border: 'none',
                fontSize: 15,
                fontFamily: 'inherit',
                cursor: running || !fileId ? 'default' : 'pointer',
                background: running || !fileId ? '#cbd5d3' : `linear-gradient(135deg,${TEAL},${TEAL_2})`,
              }}
            >
              {running
                ? <><Loader2 size={16} className="animate-spin" /> {previousFileId ? 'משווה בין הגרסאות…' : 'קורא את הגרסה החדשה…'} (כמה דקות)</>
                : <>🐕 בדוק מה תוקן</>}
            </button>
          </>
        )}

        {error && (
          <div style={{ marginTop: 14, fontSize: 13, color: '#b42318', background: '#fef3f2', border: '1px solid #fee4e2', borderRadius: 10, padding: '10px 12px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
