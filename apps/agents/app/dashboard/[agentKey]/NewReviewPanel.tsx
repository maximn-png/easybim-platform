'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, FileText, FolderSearch, History, Loader2, Plus, Search, X } from 'lucide-react'
import {
  CARD, CandidateFile, MAX_PREVIOUS_CONTRACTS, PreviousContractOption, PreviousContractSuggestions,
  ProjectFolder, ProjectInspection, SlotInspection, TEAL, TEAL_2, fmtDate,
} from './dogMeta'

// The only way a review starts: pick a project folder, confirm the two files Dog
// found, run. Nothing here happens on its own — the picker resolves the files and
// shows them, so a wrong guess costs one click instead of a bad review.
export default function NewReviewPanel({
  agentKey,
  onClose,
  onCreated,
}: {
  agentKey: string
  onClose: () => void
  onCreated: (reviewId: string) => void
}) {
  const [projects, setProjects] = useState<ProjectFolder[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [query, setQuery] = useState('')
  const [inspection, setInspection] = useState<ProjectInspection | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [agreementId, setAgreementId] = useState('')
  const [quoteId, setQuoteId] = useState('')
  const [previous, setPrevious] = useState<PreviousContractOption[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/dashboard/${agentKey}/projects`, { cache: 'no-store' })
        const d = await res.json()
        if (cancelled) return
        if (!res.ok) setError(d.error ?? 'טעינת הפרויקטים נכשלה')
        else setProjects(d.projects ?? [])
      } catch {
        if (!cancelled) setError('טעינת הפרויקטים נכשלה')
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agentKey])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return projects.slice(0, 40)
    return projects.filter((p) => p.name.includes(q)).slice(0, 40)
  }, [projects, query])

  const inspect = useCallback(
    async (folderIdOrUrl: string) => {
      setInspecting(true)
      setError(null)
      setInspection(null)
      try {
        const res = await fetch(
          `/api/dashboard/${agentKey}/projects?folderId=${encodeURIComponent(folderIdOrUrl)}`,
          { cache: 'no-store' }
        )
        const d = await res.json()
        if (!res.ok) {
          setError(d.error ?? 'קריאת תיקיית הפרויקט נכשלה')
          return
        }
        const insp = d.inspection as ProjectInspection
        setInspection(insp)
        setAgreementId(insp.agreement.suggestedFileId ?? '')
        setQuoteId(insp.quote.suggestedFileId ?? '')
        setPrevious([])
      } catch {
        setError('קריאת תיקיית הפרויקט נכשלה')
      } finally {
        setInspecting(false)
      }
    },
    [agentKey]
  )

  async function run() {
    if (!inspection || !agreementId || !quoteId) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectFolderId: inspection.projectFolderId,
          projectName: inspection.projectName,
          agreementFileId: agreementId,
          quoteFileId: quoteId,
          previous: previous.map((p) => ({ fileId: p.fileId, projectLabel: p.projectLabel })),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'הבדיקה נכשלה')
        return
      }
      onCreated(d.review.id)
    } catch {
      setError('הבדיקה נכשלה — נסו שוב')
    } finally {
      setRunning(false)
    }
  }

  // A run costs minutes and real money — a stray backdrop click must not lose
  // it. The X still works mid-run, with a heads-up that the run continues.
  function requestClose() {
    if (running && !window.confirm('הבדיקה ממשיכה ברקע ותופיע ברשימה כשתסתיים. לסגור את החלון?')) return
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,.45)' }}
      onClick={() => { if (!running) onClose() }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: 720, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', padding: '24px 26px' }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>בדיקת הסכם חדשה</h2>
          <button onClick={requestClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9aa0ac' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8a9391' }}>
          בחרו את תיקיית הפרויקט. כלב יאתר את ההסכם בתיקיית &quot;חוזה&quot; ואת הצעת המחיר בתיקיית &quot;הצעות מחיר&quot;.
        </p>

        {/* project picker */}
        <div className="flex items-center gap-2 mb-3" style={{ border: '1px solid #e6efee', borderRadius: 12, padding: '9px 12px' }}>
          <Search size={15} style={{ color: '#9aa0ac', flex: 'none' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם פרויקט או מספר הצעה — או הדבקת קישור לתיקייה בדרייב"
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, fontFamily: 'inherit', background: 'transparent' }}
          />
          {query.includes('/folders/') && (
            <button
              onClick={() => inspect(query.trim())}
              style={{ border: 'none', background: TEAL, color: '#fff', borderRadius: 8, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              פתח
            </button>
          )}
        </div>

        {loadingProjects && (
          <div className="flex items-center gap-2" style={{ fontSize: 13, color: '#8a9391', padding: '10px 2px' }}>
            <Loader2 size={14} className="animate-spin" /> טוען פרויקטים מהדרייב…
          </div>
        )}

        {!loadingProjects && !inspection && (
          <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid #f0f5f4', borderRadius: 12 }}>
            {filtered.length === 0 && (
              <div style={{ fontSize: 13, color: '#a9adb8', padding: 14 }}>לא נמצאו פרויקטים תואמים.</div>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => inspect(p.id)}
                className="flex items-center gap-2 w-full text-right"
                style={{ padding: '11px 14px', border: 'none', borderTop: '1px solid #f4f8f7', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
              >
                <FolderSearch size={15} style={{ color: TEAL_2, flex: 'none' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              </button>
            ))}
          </div>
        )}

        {inspecting && (
          <div className="flex items-center gap-2" style={{ fontSize: 13, color: '#8a9391', padding: '10px 2px' }}>
            <Loader2 size={14} className="animate-spin" /> מחפש את הקבצים בתיקיית הפרויקט…
          </div>
        )}

        {inspection && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div style={{ fontSize: 15, fontWeight: 800 }}>{inspection.projectName}</div>
              <button
                onClick={() => { setInspection(null); setError(null) }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: TEAL }}
              >
                בחירת פרויקט אחר
              </button>
            </div>

            <FileSlot label="ההסכם מהלקוח" slot={inspection.agreement} value={agreementId} onChange={setAgreementId} />
            <FileSlot label="הצעת המחיר ששלחנו" slot={inspection.quote} value={quoteId} onChange={setQuoteId} />

            <PreviousContracts
              agentKey={agentKey}
              inspection={inspection}
              projects={projects}
              selected={previous}
              onChange={setPrevious}
            />

            <button
              onClick={run}
              disabled={running || !agreementId || !quoteId}
              className="flex items-center justify-center gap-2 w-full font-bold text-white"
              style={{
                marginTop: 18,
                padding: '13px 0',
                borderRadius: 13,
                border: 'none',
                fontSize: 15,
                fontFamily: 'inherit',
                cursor: running || !agreementId || !quoteId ? 'default' : 'pointer',
                background: running || !agreementId || !quoteId ? '#cbd5d3' : `linear-gradient(135deg,${TEAL},${TEAL_2})`,
              }}
            >
              {running
                ? <><Loader2 size={16} className="animate-spin" /> קורא את המסמכים… {previous.length ? '(כמה דקות)' : '(עד כדקתיים)'}</>
                : <>🐕 הרץ בדיקה{previous.length ? ` והשווה ל-${previous.length} הסכמים קודמים` : ''}</>}
            </button>
          </div>
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

/**
 * Optional: compare this agreement against contracts we already signed with the
 * same client — the old report's X1/X2/X3 columns. Same-client contracts are
 * suggested from Squirrel's quote index; since only repeat clients have any (and
 * ~1 in 4 records carries no client at all), picking from any project by hand is
 * always available beside the suggestions.
 */
function PreviousContracts({
  agentKey,
  inspection,
  projects,
  selected,
  onChange,
}: {
  agentKey: string
  inspection: ProjectInspection
  projects: ProjectFolder[]
  selected: PreviousContractOption[]
  onChange: (v: PreviousContractOption[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<PreviousContractSuggestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [manualProject, setManualProject] = useState('')
  const [manualSlot, setManualSlot] = useState<SlotInspection | null>(null)
  const [manualFile, setManualFile] = useState('')
  const [manualLoading, setManualLoading] = useState(false)

  // Fetched only when the section is opened — the lookup walks Drive per sibling
  // project, so it should not run for reviews that skip the comparison.
  useEffect(() => {
    if (!open || suggestions || loading) return
    setLoading(true)
    ;(async () => {
      try {
        const url = `/api/dashboard/${agentKey}/projects?folderId=${encodeURIComponent(inspection.projectFolderId)}&previous=1&projectName=${encodeURIComponent(inspection.projectName)}`
        const res = await fetch(url, { cache: 'no-store' })
        const d = await res.json()
        setSuggestions(res.ok ? d.suggestions : { client: null, note: d.error ?? 'החיפוש נכשל', options: [] })
      } catch {
        setSuggestions({ client: null, note: 'החיפוש נכשל', options: [] })
      } finally {
        setLoading(false)
      }
    })()
  }, [open, suggestions, loading, agentKey, inspection])

  const full = selected.length >= MAX_PREVIOUS_CONTRACTS
  const has = (fileId: string) => selected.some((s) => s.fileId === fileId)

  function toggle(opt: PreviousContractOption) {
    if (has(opt.fileId)) onChange(selected.filter((s) => s.fileId !== opt.fileId))
    else if (!full) onChange([...selected, opt])
  }

  async function loadManual(folderId: string) {
    setManualProject(folderId)
    setManualFile('')
    setManualSlot(null)
    if (!folderId) return
    setManualLoading(true)
    try {
      const res = await fetch(
        `/api/dashboard/${agentKey}/projects?folderId=${encodeURIComponent(folderId)}&contracts=1`,
        { cache: 'no-store' }
      )
      const d = await res.json()
      if (res.ok) setManualSlot(d.slot)
    } finally {
      setManualLoading(false)
    }
  }

  function addManual() {
    const file = manualSlot?.candidates.find((c) => c.fileId === manualFile)
    const project = projects.find((p) => p.id === manualProject)
    if (!file || !project || full || has(file.fileId)) return
    onChange([
      ...selected,
      {
        fileId: file.fileId,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        projectLabel: project.name,
        projectFolderId: project.id,
      },
    ])
    setManualProject('')
    setManualSlot(null)
    setManualFile('')
  }

  return (
    <div style={{ border: '1px solid #e6efee', borderRadius: 13, padding: '13px 15px', marginBottom: 11, background: open ? '#fbfdfd' : 'transparent' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-right"
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
      >
        {open ? <ChevronDown size={15} style={{ color: TEAL }} /> : <ChevronLeft size={15} style={{ color: TEAL }} />}
        <History size={15} style={{ color: TEAL }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#5a5f6e' }}>השוואה להסכמים קודמים</span>
        <span style={{ fontSize: 11.5, color: '#a9adb8' }}>
          {selected.length ? `${selected.length} נבחרו` : 'אופציונלי'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#8a9391', lineHeight: 1.6 }}>
            לכל ממצא כלב יוסיף הערה קצרה על מצב אותו סעיף בכל הסכם שכבר חתמנו — &quot;הופיע וטופל&quot;, &quot;לא הופיע&quot;, &quot;נוסח מתון יותר&quot;.
            עד {MAX_PREVIOUS_CONTRACTS} הסכמים; כל אחד מאריך את הבדיקה ומוסיף לעלותה.
          </p>

          {loading && (
            <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: '#8a9391' }}>
              <Loader2 size={13} className="animate-spin" /> מחפש הסכמים של אותו לקוח…
            </div>
          )}

          {suggestions?.client && (
            <div style={{ fontSize: 12.5, color: '#5a5f6e', fontWeight: 700, marginBottom: 7 }}>
              לקוח: {suggestions.client}
            </div>
          )}
          {suggestions?.note && (
            <div style={{ fontSize: 12.5, color: '#8a9391', marginBottom: 9 }}>{suggestions.note}</div>
          )}

          {suggestions?.options.map((opt) => (
            <label
              key={opt.fileId}
              className="flex items-start gap-2.5"
              style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${has(opt.fileId) ? TEAL : '#eef4f3'}`, background: has(opt.fileId) ? '#f0faf8' : '#fff', marginBottom: 6, cursor: full && !has(opt.fileId) ? 'default' : 'pointer' }}
            >
              <input
                type="checkbox"
                checked={has(opt.fileId)}
                disabled={full && !has(opt.fileId)}
                onChange={() => toggle(opt)}
                style={{ marginTop: 3, accentColor: TEAL }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{opt.projectLabel}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#a9adb8', marginTop: 2 }}>
                  {opt.name} · {fmtDate(opt.modifiedTime)}
                </span>
              </span>
            </label>
          ))}

          {/* Contracts chosen from a project the index didn't link to this client. */}
          {selected.filter((s) => !suggestions?.options.some((o) => o.fileId === s.fileId)).map((s) => (
            <div key={s.fileId} className="flex items-center gap-2" style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${TEAL}`, background: '#f0faf8', marginBottom: 6 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{s.projectLabel}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#a9adb8', marginTop: 2 }}>{s.name}</span>
              </span>
              <button
                onClick={() => onChange(selected.filter((x) => x.fileId !== s.fileId))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9aa0ac' }}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Manual path — any project's contract folder. */}
          {!full && (
            <div style={{ borderTop: '1px dashed #e6efee', marginTop: 10, paddingTop: 10 }}>
              <div style={{ fontSize: 12, color: '#8a9391', marginBottom: 6 }}>הוספה מפרויקט אחר:</div>
              <select
                value={manualProject}
                onChange={(e) => loadManual(e.target.value)}
                style={{ width: '100%', fontSize: 13, fontFamily: 'inherit', padding: '8px 9px', borderRadius: 9, border: '1px solid #e6efee', background: '#fff', marginBottom: 6 }}
              >
                <option value="">— בחרו פרויקט —</option>
                {projects
                  .filter((p) => p.id !== inspection.projectFolderId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>

              {manualLoading && (
                <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#8a9391' }}>
                  <Loader2 size={12} className="animate-spin" /> קורא את תיקיית החוזה…
                </div>
              )}

              {manualSlot && manualSlot.candidates.length === 0 && (
                <div style={{ fontSize: 12.5, color: '#b54708' }}>אין מסמכים קריאים בתיקיית החוזה של הפרויקט הזה.</div>
              )}

              {manualSlot && manualSlot.candidates.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={manualFile}
                    onChange={(e) => setManualFile(e.target.value)}
                    style={{ flex: 1, fontSize: 13, fontFamily: 'inherit', padding: '8px 9px', borderRadius: 9, border: '1px solid #e6efee', background: '#fff' }}
                  >
                    <option value="">— בחרו קובץ —</option>
                    {manualSlot.candidates.map((c) => (
                      <option key={c.fileId} value={c.fileId}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={addManual}
                    disabled={!manualFile}
                    className="flex items-center gap-1.5 font-bold"
                    style={{ border: 'none', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontFamily: 'inherit', color: '#fff', cursor: manualFile ? 'pointer' : 'default', background: manualFile ? TEAL : '#cbd5d3' }}
                  >
                    <Plus size={13} /> הוסף
                  </button>
                </div>
              )}
            </div>
          )}

          {full && (
            <div style={{ fontSize: 12, color: '#8a9391', marginTop: 8 }}>
              הגעתם למקסימום של {MAX_PREVIOUS_CONTRACTS} הסכמים קודמים.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FileSlot({
  label,
  slot,
  value,
  onChange,
}: {
  label: string
  slot: SlotInspection
  value: string
  onChange: (v: string) => void
}) {
  const chosen: CandidateFile | undefined = slot.candidates.find((c) => c.fileId === value)

  return (
    <div style={{ border: '1px solid #e6efee', borderRadius: 13, padding: '13px 15px', marginBottom: 11 }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#5a5f6e' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: '#a9adb8' }}>תיקייה: {slot.folder}</span>
      </div>

      {slot.folderId === null && (
        <div style={{ fontSize: 13, color: '#b42318' }}>
          לא נמצאה תיקיית &quot;{slot.folder}&quot; בפרויקט הזה.
        </div>
      )}
      {slot.folderId !== null && slot.candidates.length === 0 && (
        <div style={{ fontSize: 13, color: '#b42318' }}>
          התיקייה ריקה ממסמכים קריאים (PDF / Word / Google Docs).
        </div>
      )}

      {slot.candidates.length > 0 && (
        <>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', fontSize: 14, fontFamily: 'inherit', padding: '9px 10px', borderRadius: 10, border: '1px solid #e6efee', background: '#fbfdfd' }}
          >
            {/* These folders also hold insurance annexes, POs and older versions,
                so when no name looks right Dog picks nothing rather than guessing. */}
            <option value="">— בחרו קובץ —</option>
            {slot.candidates.map((c) => (
              <option key={c.fileId} value={c.fileId}>
                {c.name}
              </option>
            ))}
          </select>
          {chosen ? (
            <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: '#a9adb8', marginTop: 6 }}>
              <FileText size={12} /> עודכן {fmtDate(chosen.modifiedTime)}
              {chosen.fileId === slot.suggestedFileId && <span style={{ color: TEAL, fontWeight: 700 }}>· בחירת כלב</span>}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: '#b54708', marginTop: 6 }}>
              כלב לא זיהה קובץ מתאים בתיקייה — בחרו ידנית מהרשימה.
            </div>
          )}
        </>
      )}
    </div>
  )
}
