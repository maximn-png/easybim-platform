// The BIM newsletter as an idea source for "1. Professional" posts.
//
// apps/newsletter generates weekly newsletters from 21 RSS sources via Gemini;
// each one carries ~7 topics with a body and a real source URL. Peacock reads
// them so a thought-leadership post starts from something that actually happened
// in the industry, with a citable source, instead of an invented subject.
//
// Read-only and cross-DB on the same cluster — the same approach projects.ts uses
// for EPM (reuse the agents connection, switch DB, no second pool).
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db/mongoose'

const NEWSLETTER_DB = 'bim-newsletter'
const NEWSLETTERS = 'newsletters'

export interface NewsletterTopicDTO {
  newsletterId: string
  newsletterTitle: string
  /** ISO date of the newsletter issue. */
  date: string
  /** Index of the topic inside its issue — with newsletterId it addresses one topic. */
  index: number
  title: string
  body: string
  sourceUrl: string | null
  sourceName: string | null
  /** True once some post already cites this topic's source URL. */
  used?: boolean
}

export interface NewsletterIssueDTO {
  id: string
  title: string
  date: string
  status: string
  topicCount: number
}

interface NewsletterDoc {
  _id: unknown
  title?: string
  date?: Date
  status?: string
  topics?: { title?: string; body?: string; sourceUrl?: string; sourceName?: string }[]
}

function db() {
  return mongoose.connection.useDb(NEWSLETTER_DB, { useCache: true })
}

// Two hard constraints on every query here, both learned from the real collection
// (21 issues, ~8MB each, 165MB total):
//
// 1. Sort by `_id`, never by `date`. The only indexes are `_id` and
//    {userId, date}, so a bare `date` sort is an in-memory sort of the whole
//    collection and Mongo aborts it (QueryExceededMemoryLimitNoDiskUseAllowed).
//    ObjectIds are monotonic and issues are created in date order — verified that
//    `_id` desc gives exactly the same ordering as `date` desc.
// 2. Project individual topic subfields, never `topics: 1`. Topics carry
//    `imageBase64`, so `topics: 1` is ~8MB per document; naming the four fields
//    we use brings four whole issues down to ~32KB.
const TOPIC_FIELDS = {
  'topics.title': 1,
  'topics.body': 1,
  'topics.sourceUrl': 1,
  'topics.sourceName': 1,
} as const

/** Recent issues, newest first (metadata only — no topic bodies). */
export async function listIssues(limit = 12): Promise<NewsletterIssueDTO[]> {
  await connectDB()
  const docs = (await db()
    .collection(NEWSLETTERS)
    .find({}, { projection: { title: 1, date: 1, status: 1, 'topics.title': 1 } })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray()) as NewsletterDoc[]

  return docs.map((d) => ({
    id: String(d._id),
    title: d.title ?? 'Newsletter',
    date: d.date ? new Date(d.date).toISOString() : '',
    status: d.status ?? 'draft',
    topicCount: d.topics?.length ?? 0,
  }))
}

/**
 * Topics from the most recent issues, flattened newest-first — the pool Peacock
 * picks a Professional post from. Bodies are trimmed; use readTopic for one in full.
 */
export async function listRecentTopics(opts: { issues?: number; bodyChars?: number } = {}): Promise<NewsletterTopicDTO[]> {
  await connectDB()
  const { issues = 4, bodyChars = 400 } = opts
  const docs = (await db()
    .collection(NEWSLETTERS)
    .find({}, { projection: { title: 1, date: 1, ...TOPIC_FIELDS } })
    .sort({ _id: -1 })
    .limit(issues)
    .toArray()) as NewsletterDoc[]

  const out: NewsletterTopicDTO[] = []
  for (const d of docs) {
    const date = d.date ? new Date(d.date).toISOString() : ''
    ;(d.topics ?? []).forEach((t, index) => {
      if (!t?.title) return
      const body = (t.body ?? '').trim()
      out.push({
        newsletterId: String(d._id),
        newsletterTitle: d.title ?? 'Newsletter',
        date,
        index,
        title: t.title.trim(),
        body: body.length > bodyChars ? `${body.slice(0, bodyChars)}…` : body,
        sourceUrl: t.sourceUrl?.trim() || null,
        sourceName: t.sourceName?.trim() || null,
      })
    })
  }
  return out
}

/** One topic in full, addressed by issue id + index. */
export async function readTopic(newsletterId: string, index: number): Promise<NewsletterTopicDTO | null> {
  await connectDB()
  if (!mongoose.isValidObjectId(newsletterId)) return null
  const doc = (await db()
    .collection(NEWSLETTERS)
    .findOne(
      { _id: new mongoose.Types.ObjectId(newsletterId) },
      { projection: { title: 1, date: 1, ...TOPIC_FIELDS } }
    )) as NewsletterDoc | null

  const t = doc?.topics?.[index]
  if (!doc || !t?.title) return null
  return {
    newsletterId: String(doc._id),
    newsletterTitle: doc.title ?? 'Newsletter',
    date: doc.date ? new Date(doc.date).toISOString() : '',
    index,
    title: t.title.trim(),
    body: (t.body ?? '').trim(),
    sourceUrl: t.sourceUrl?.trim() || null,
    sourceName: t.sourceName?.trim() || null,
  }
}
