import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { geminiChat } from '@/lib/integrations/gemini'
import { searchChunks } from '@/lib/kc/search'

const MAX_QUESTION = 2000

// POST /api/kc/mentor/ask — the real replacement for kc-app.js's mAnswer,
// which never read the user's actual question at all. Grounds the answer
// in real vector-search results across every digested document (see
// lib/kc/search.ts), not just whatever's currently open.
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : ''
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })
  const preferSourceId = typeof body?.sourceId === 'string' ? body.sourceId : undefined

  let results
  try {
    results = await searchChunks(question, { limit: 6, preferSourceId })
  } catch (err) {
    console.error('[mentor/ask] searchChunks failed:', err)
    return NextResponse.json({ error: 'The mentor is unavailable right now — please try again.' }, { status: 502 })
  }

  if (!results.length) {
    return NextResponse.json({
      answer: "I couldn't find anything in the Knowledge Center about that yet — try rephrasing, or browse the topic tree.",
      sources: [],
    })
  }

  const excerpts = results.map((r, i) => `[${i + 1}] (${r.title})\n${r.text}`).join('\n\n')
  const prompt = `You are the EasyBIM Knowledge Center's mentor, helping an employee with Revit/BIM workflows and EasyBIM's own internal standards. Answer the question using ONLY the excerpts below when they're actually relevant; if they don't answer it, say so honestly rather than inventing details. Be concise — a few sentences, or a short list. Cite the excerpt number(s) you used inline like [1].

Excerpts:
${excerpts}

Question: ${question}`

  let answer: string
  try {
    answer = await geminiChat(prompt)
  } catch (err) {
    console.error('[mentor/ask] Gemini call failed:', err)
    return NextResponse.json({ error: 'The mentor is unavailable right now — please try again.' }, { status: 502 })
  }

  const seen = new Set<string>()
  const sources = results
    .filter((r) => {
      if (seen.has(r.sourceId)) return false
      seen.add(r.sourceId)
      return true
    })
    .map((r) => ({ title: r.title, sourceId: r.sourceId, anchor: r.anchor }))

  return NextResponse.json({ answer, sources })
}
