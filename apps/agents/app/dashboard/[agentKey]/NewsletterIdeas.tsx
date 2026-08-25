'use client'

import { useCallback, useEffect, useState } from 'react'
import { Newspaper, ExternalLink, Plus, Check, AlertCircle, RefreshCw } from 'lucide-react'
import { CARD, PURPLE, PURPLE_2 } from './postMeta'

// The BIM newsletter as Peacock's idea source for "1. Professional" posts.
// Each topic already carries a real source, so a post drafted from one is
// grounded in something that happened rather than an invented subject. Topics a
// post already cites are marked used, so the same story isn't posted twice.

interface Topic {
  newsletterId: string
  newsletterTitle: string
  date: string
  index: number
  title: string
  body: string
  sourceUrl: string | null
  sourceName: string | null
  used?: boolean
}

export default function NewsletterIdeas({
  agentKey, onOpenPost,
}: {
  agentKey: string
  onOpenPost: (id: string) => void
}) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [newsletterUrl, setNewsletterUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/newsletter?issues=3`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Could not read the newsletter.'); setTopics([]) }
      else { setTopics(d.topics ?? []); setNewsletterUrl(d.newsletterUrl ?? null); setError(null) }
    } catch {
      setError('Could not reach the newsletter.')
    } finally { setLoading(false) }
  }, [agentKey])

  useEffect(() => { load() }, [load])

  /** Seed a post from a topic, carrying the source through for provenance. */
  async function draftFrom(topic: Topic) {
    const key = `${topic.newsletterId}:${topic.index}`
    if (creating) return
    setCreating(key)
    try {
      const res = await fetch(`/api/dashboard/${agentKey}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topic.title,
          postType: '1. Professional',
          notes: `מבוסס על נושא מהניוזלטר (${topic.sourceName ?? 'source'}): ${topic.sourceUrl ?? ''}`.trim(),
          sourceUrl: topic.sourceUrl ?? undefined,
          sourceName: topic.sourceName ?? undefined,
        }),
      })
      if (res.ok) {
        const d = await res.json()
        setTopics((xs) => xs.map((t) => (t.newsletterId === topic.newsletterId && t.index === topic.index ? { ...t, used: true } : t)))
        if (d.post?.id) onOpenPost(d.post.id)
      }
    } catch { /* transient */ } finally { setCreating(null) }
  }

  const fresh = topics.filter((t) => !t.used)
  const shown = showAll ? topics : fresh.slice(0, 4)

  return (
    <div style={{ ...CARD, padding: '22px 24px 16px' }}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center text-white" style={{ width: 30, height: 30, borderRadius: 10,
            background: `linear-gradient(135deg,${PURPLE},${PURPLE_2})`, flex: 'none' }}>
            <Newspaper size={16} />
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Newsletter Ideas</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#9aa0ac' }}>
              Topics from the BIM newsletter — the idea source for Professional posts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5" style={{ flex: 'none' }}>
          <button onClick={load} title="Refresh"
            style={{ border: '1px solid #e7e3f7', background: '#fff', color: PURPLE, borderRadius: 9, padding: '6px 8px', cursor: 'pointer', display: 'flex' }}>
            <RefreshCw size={13} />
          </button>
          {newsletterUrl && (
            <a href={newsletterUrl} target="_blank" rel="noreferrer" title="Open the Newsletter Generator"
              className="flex items-center gap-1.5"
              style={{ border: '1px solid #e7e3f7', background: '#fff', color: PURPLE, borderRadius: 9,
                padding: '6px 10px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
              Newsletter <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      {loading && <p style={{ fontSize: 13, color: '#a9adb8', padding: '16px 0 6px' }}>Loading topics…</p>}

      {error && !loading && (
        <div className="flex items-start gap-2" style={{ fontSize: 12.5, color: '#e2445c', padding: '14px 0 4px', lineHeight: 1.55 }}>
          <AlertCircle size={14} style={{ flex: 'none', marginTop: 2 }} /> {error}
        </div>
      )}

      {!loading && !error && topics.length === 0 && (
        <p style={{ fontSize: 12.5, color: '#a9adb8', padding: '14px 0 6px', lineHeight: 1.6 }}>
          No newsletter topics found. Generate an issue in the Newsletter Generator and they&apos;ll show up here.
        </p>
      )}

      {!loading && shown.map((t) => {
        const key = `${t.newsletterId}:${t.index}`
        return (
          <div key={key} className="flex items-start gap-3" style={{ padding: '12px 0', borderTop: '1px solid #f4f2fa' }}>
            <div className="flex-1 min-w-0">
              <div dir="auto" style={{ fontSize: 13.5, fontWeight: 600, color: '#2b2f3a', lineHeight: 1.45 }}>
                {t.title}
              </div>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 11.5, color: '#a9adb8' }}>
                  {t.sourceName ?? 'source'} · {t.date.slice(0, 10)}
                </span>
                {t.sourceUrl && (
                  <a href={t.sourceUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11.5, color: PURPLE, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    source <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
            {t.used ? (
              <span className="flex items-center gap-1.5" style={{ flex: 'none', fontSize: 11.5, fontWeight: 700,
                color: '#16a34a', background: '#e8f9ee', borderRadius: 8, padding: '6px 9px' }}>
                <Check size={12} /> used
              </span>
            ) : (
              <button
                onClick={() => draftFrom(t)}
                disabled={creating === key}
                className="flex items-center gap-1.5"
                style={{ flex: 'none', border: '1px solid #e7e3f7', background: '#fff', color: PURPLE, borderRadius: 9,
                  padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: creating === key ? 'wait' : 'pointer', fontFamily: 'inherit' }}
              >
                <Plus size={12} /> {creating === key ? 'Adding…' : 'Draft post'}
              </button>
            )}
          </div>
        )
      })}

      {!loading && !error && topics.length > 0 && (
        <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
          <span style={{ fontSize: 11.5, color: '#a9adb8' }}>
            {fresh.length} unused of {topics.length} recent topics
          </span>
          <button onClick={() => setShowAll((v) => !v)}
            style={{ border: 'none', background: 'transparent', color: PURPLE, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            {showAll ? 'Show fewer' : 'Show all'}
          </button>
        </div>
      )}
    </div>
  )
}
