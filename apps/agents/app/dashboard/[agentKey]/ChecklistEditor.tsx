'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Lightbulb, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { CARD, Checklist, ChecklistTopic, TEAL, TEAL_2, fmtDate } from './dogMeta'

// The checklist is the real IP carried over from the local Python tool: seven
// subjects to check and a list of generic clauses to stay silent about. Editing
// it here bumps its version, and each review records the version that produced it.
export default function ChecklistEditor({ agentKey, onClose }: { agentKey: string; onClose: () => void }) {
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [topics, setTopics] = useState<ChecklistTopic[]>([])
  const [ignore, setIgnore] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load(c: Checklist) {
    setChecklist(c)
    setTopics(c.topics)
    setIgnore(c.ignore.join('\n'))
    setDirty(false)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/dashboard/${agentKey}/checklist`, { cache: 'no-store' })
        const d = await res.json()
        if (cancelled) return
        if (!res.ok) setError(d.error ?? 'טעינת הצ׳קליסט נכשלה')
        else load(d.checklist)
      } catch {
        if (!cancelled) setError('טעינת הצ׳קליסט נכשלה')
      }
    })()
    return () => { cancelled = true }
  }, [agentKey])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/checklist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, ignore: ignore.split('\n').map((s) => s.trim()).filter(Boolean) }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'השמירה נכשלה'); return }
      load(d.checklist)
    } catch {
      setError('השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    setSaving(true)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/checklist`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) load(d.checklist)
    } finally {
      setSaving(false)
    }
  }

  function patch(idx: number, field: keyof ChecklistTopic, value: string) {
    setTopics((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
    setDirty(true)
  }

  function requestClose() {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?')) return
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,.45)' }} onClick={requestClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: 760, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px 26px' }}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>מה כלב בודק</h2>
          <button onClick={requestClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9aa0ac' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8a9391' }}>
          כלב בודק אך ורק את הנושאים שברשימה הזו. גרסה {checklist?.version ?? '—'}.
        </p>

        {topics.map((t, i) => (
          <div key={i} style={{ border: '1px solid #e6efee', borderRadius: 13, padding: '13px 15px', marginBottom: 10 }}>
            <div className="flex items-center gap-2 mb-2">
              <input
                value={t.title}
                onChange={(e) => patch(i, 'title', e.target.value)}
                placeholder="שם הנושא"
                style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', padding: '7px 9px', borderRadius: 9, border: '1px solid #e6efee', background: '#fbfdfd' }}
              />
              <button
                onClick={() => { setTopics((r) => r.filter((_, j) => j !== i)); setDirty(true) }}
                style={{ border: 'none', background: 'transparent', color: '#c9ced8', cursor: 'pointer' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={t.detail}
              onChange={(e) => patch(i, 'detail', e.target.value)}
              placeholder="מה לחפש — כמו שהיית מסביר לעורך דין חדש"
              rows={2}
              style={{ width: '100%', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', padding: '8px 10px', borderRadius: 9, border: '1px solid #e6efee', background: '#fff', resize: 'vertical' }}
            />
          </div>
        ))}

        <button
          onClick={() => { setTopics((r) => [...r, { title: '', detail: '' }]); setDirty(true) }}
          className="flex items-center gap-2 font-bold"
          style={{ border: '1px dashed #cfe0dd', borderRadius: 11, padding: '9px 15px', fontSize: 13, fontFamily: 'inherit', background: 'transparent', color: TEAL, cursor: 'pointer', marginBottom: 20 }}
        >
          <Plus size={14} /> הוסף נושא
        </button>

        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>נושאים שלא לדווח עליהם</div>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#8a9391' }}>
          סעיפים גנריים שמופיעים בכל חוזה ייעוץ ולא מעניינים אותנו. שורה לכל נושא.
        </p>
        <textarea
          value={ignore}
          onChange={(e) => { setIgnore(e.target.value); setDirty(true) }}
          rows={6}
          style={{ width: '100%', fontSize: 13.5, lineHeight: 1.7, fontFamily: 'inherit', padding: '10px 12px', borderRadius: 11, border: '1px solid #e6efee', background: '#fff', resize: 'vertical' }}
        />

        <LearnedGuidance agentKey={agentKey} />

        {error && <div style={{ fontSize: 13, color: '#b42318', marginTop: 12 }}>{error}</div>}

        <div className="flex items-center gap-2.5" style={{ marginTop: 18 }}>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-2 font-bold text-white"
            style={{ border: 'none', borderRadius: 11, padding: '11px 18px', fontSize: 14, fontFamily: 'inherit', cursor: dirty && !saving ? 'pointer' : 'default', background: dirty && !saving ? `linear-gradient(135deg,${TEAL},${TEAL_2})` : '#cbd5d3' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-2 font-bold"
            style={{ border: '1px solid #d7e6e4', borderRadius: 11, padding: '11px 16px', fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: '#5a5f6e', cursor: 'pointer' }}
          >
            <RotateCcw size={14} /> שחזר את שבעת הנושאים המקוריים
          </button>
        </div>
      </div>
    </div>
  )
}

interface GuidanceItem {
  id: string
  text: string
  active: boolean
  createdAt: string | null
}

/**
 * The guidance lines Dog accumulated from "שפר להבא" feedback (and chat).
 * Active lines are injected into every review and follow-up prompt; a toggle
 * pauses one without losing it. Mirrors InfoPanel's ImprovementsTab, in the
 * dog dashboard's Hebrew/RTL styling.
 */
function LearnedGuidance({ agentKey }: { agentKey: string }) {
  const [items, setItems] = useState<GuidanceItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/guidance`, { cache: 'no-store' })
      if (res.ok) setItems((await res.json()).guidance ?? [])
    } catch {
      /* transient */
    } finally {
      setLoaded(true)
    }
  }, [agentKey])

  useEffect(() => { load() }, [load])

  async function toggle(item: GuidanceItem) {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/guidance/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      })
      if (res.ok) setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, active: !item.active } : x)))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: GuidanceItem) {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/guidance/${item.id}`, { method: 'DELETE' })
      if (res.ok) setItems((xs) => xs.filter((x) => x.id !== item.id))
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  return (
    <div style={{ marginTop: 22 }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>
        <Lightbulb size={14} style={{ color: TEAL }} /> הנחיות שכלב למד
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#8a9391' }}>
        כל משוב שנשמר דרך &quot;שפר להבא&quot; מופיע כאן ומוזרק לכל בדיקה עתידית. אפשר להשבית או למחוק.
      </p>

      {!loaded && (
        <div className="flex items-center gap-2" style={{ fontSize: 13, color: '#8a9391', padding: '6px 0' }}>
          <Loader2 size={13} className="animate-spin" /> טוען…
        </div>
      )}
      {loaded && items.length === 0 && (
        <div style={{ fontSize: 13, color: '#a9adb8', border: '1px dashed #d7e6e4', borderRadius: 11, padding: '14px 16px' }}>
          עוד אין הנחיות — כפתור &quot;שפר להבא&quot; שעל כל ממצא מוסיף אחת.
        </div>
      )}

      {items.map((item) => {
        const busy = busyId === item.id
        const confirming = confirmId === item.id
        return (
          <div
            key={item.id}
            style={{ border: '1px solid #e6efee', borderRadius: 13, padding: '11px 14px', marginBottom: 8, background: item.active ? '#fff' : '#f6f8f8', opacity: item.active ? 1 : 0.65 }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#3a3f4d' }}>{item.text}</div>
            <div className="flex items-center gap-2" style={{ marginTop: 7 }}>
              <span style={{ fontSize: 11, color: '#b0b6c0' }}>{fmtDate(item.createdAt)}</span>
              {!item.active && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', background: '#eceff0', padding: '2px 8px', borderRadius: 999 }}>מושבת</span>
              )}
              <div className="flex items-center gap-1.5" style={{ marginRight: 'auto' }}>
                {busy && <Loader2 size={12} className="animate-spin" style={{ color: '#9ca3af' }} />}
                <button
                  onClick={() => toggle(item)}
                  disabled={busy}
                  title={item.active ? 'השבת' : 'הפעל'}
                  style={{ position: 'relative', width: 32, height: 18, borderRadius: 999, border: 'none', cursor: 'pointer', background: item.active ? TEAL : 'rgba(0,0,0,.15)' }}
                >
                  <span style={{ position: 'absolute', top: 2, insetInlineStart: item.active ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'all .15s' }} />
                </button>
                <button
                  onClick={() => (confirming ? remove(item) : setConfirmId(item.id))}
                  onMouseLeave={() => confirming && setConfirmId(null)}
                  disabled={busy}
                  title={confirming ? 'לחצו שוב לאישור מחיקה' : 'מחק'}
                  style={{ border: 'none', borderRadius: 7, padding: 4, cursor: 'pointer', background: confirming ? '#fef3f2' : 'transparent' }}
                >
                  <Trash2 size={13} style={{ color: confirming ? '#dc2626' : '#9ca3af' }} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
