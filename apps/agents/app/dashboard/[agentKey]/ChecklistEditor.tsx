'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { CARD, Checklist, ChecklistTopic, TEAL, TEAL_2 } from './dogMeta'

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,.45)' }} onClick={onClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: 760, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px 26px' }}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>מה כלב בודק</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9aa0ac' }}>
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
