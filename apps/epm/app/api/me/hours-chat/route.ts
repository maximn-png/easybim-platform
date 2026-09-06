import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { TAXONOMY } from '@/lib/meTypes'

// Chat entry surface for working hours: the user writes free text (Hebrew or
// English — "עבדתי על אס גי אס 5 שעות השבוע", "approve everything yellow in my
// calendar"), Claude turns it into concrete time-entry writes against the same
// collection the week grid edits, and replies with a confirmation. The client
// sends the current week's context (projects, entries, calendar events) so the
// model never has to guess ids and can see what is already logged.

export const runtime = 'nodejs'
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INTERNAL_KEY = 'internal'
const MAX_TURNS = 20
const MAX_MSG_LEN = 2000

interface ChatTurn { role: 'user' | 'assistant'; content: string }

interface ContextProject {
  key: string
  number: string
  name: string
  roles: string[]   // non-empty = the user is staffed on it
}

interface ContextEntry {
  date: string
  projectKey: string
  subject: string
  subtopic: string
  hours: number
}

interface ContextEvent {
  id: string
  day: string
  title: string
  startTime: string | null
  durationHours: number
  allDay: boolean
  logged: boolean
  matches: Array<{ projectId: string; projectName: string; projectNumber: string }>
}

interface ChatContext {
  days: string[]
  today: string
  projects: ContextProject[]
  entries: ContextEntry[]
  events: ContextEvent[]
}

interface PlannedEntry {
  date: string
  projectKey: string
  subject: string
  subtopic: string
  hours: number
  mode: 'add' | 'set'
  eventId: string | null
}

const SYSTEM_PROMPT =
  'You are the hours-logging assistant inside EasyBIM\'s "Submit working hours" page. ' +
  'The user tells you in free text (usually Hebrew, sometimes English) what they worked on; ' +
  'you translate that into time-entry writes by calling the log_hours tool, and confirm in `reply`. ' +
  'A <context> block in the conversation carries the current state as JSON: the visible week (days, today), ' +
  'the project list (key|number|name|roles — roles non-empty means the user is staffed there), ' +
  'the week\'s existing entries, and the week\'s calendar events. ' +
  'Rules for building entries: ' +
  '(1) Project resolution: match the user\'s project words against project names/numbers (Hebrew names may be ' +
  'abbreviated or transliterated, e.g. "אס גי אס" = "אס גי אס גיתם"); prefer projects the user is staffed on. ' +
  'If no project matches confidently, ask in `reply` instead of guessing (entries: []). ' +
  '(2) Subject: derive from the user\'s role on that project — BIM Manager → "Model MGMT", MEP Coordinator → ' +
  '"Superposition", BIM Modeller → "Modelling" — unless the user names a subject explicitly. ' +
  'The internal row (projectKey "internal") only takes subject "EasyBIM Internal"; projects never take it. ' +
  '(3) Subtopic: "Meetings" for meetings/calendar events, otherwise "ProjectWork"; the internal subject uses its own ' +
  'subtopics (Training, Meetings, R&D, Social, Management). ' +
  '(4) Dates: use the day the user names; "today" = the today field. When the user gives hours for "the week" with no ' +
  'days, spread them over the week\'s working days Sunday–Thursday (days[0]..days[4]) in 0.25h steps, preserving the ' +
  'exact total (e.g. 5h → 1h × 5 days; 10h over 3 projects "split equally" → 3.25/3.25/3.5 spread over those days). ' +
  '(5) Calendar approvals: "yellow"/recognized events are those with matches and logged=false. Approving one means: ' +
  'for each matched project, one entry on the event\'s day, subject by role, subtopic "Meetings", ' +
  'hours = event duration split equally across its matches (round to 0.25, min 0.25), mode "add", eventId = the event id. ' +
  'Never log an event with logged=true again. ' +
  '(6) mode: "add" accumulates on top of what exists, "set" replaces that exact subject·subtopic slot (use "set" when the ' +
  'user corrects a value; hours 0 with "set" clears it). Check the existing entries — if what the user describes is ' +
  'already logged, don\'t double it; say so in `reply`. ' +
  '(7) Hours are 0–24 per entry in 0.25 steps. ' +
  'Always call log_hours exactly once. When you only need to answer or ask a question, call it with entries: []. ' +
  '`reply` is shown in the chat: answer in the user\'s language, briefly — list what you logged (project, day, hours) ' +
  'or ask the one clarifying question you need. Never invent projects, days or event ids not present in the context.'

// userId → display name (same convention as the time-entries route: entries
// are written self-describing).
const nameCache = new Map<string, string>()
async function displayName(userId: string): Promise<string | undefined> {
  const hit = nameCache.get(userId)
  if (hit !== undefined) return hit || undefined
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
    nameCache.set(userId, name)
    return name || undefined
  } catch {
    return undefined
  }
}

// One entry write, mirroring POST /api/me/time-entries semantics.
async function applyEntry(
  userId: string,
  userName: string | undefined,
  projectName: string | undefined,
  e: PlannedEntry,
): Promise<number> {
  const { connectDB } = await import('@easybim/db')
  const TimeEntry = (await import('@/app/models/TimeEntry')).default
  const { Types } = await import('mongoose')
  await connectDB()

  const filter = { userId, projectKey: e.projectKey, date: e.date, subject: e.subject, subtopic: e.subtopic }
  if (e.mode === 'set' && e.hours === 0) {
    await TimeEntry.deleteOne(filter)
    return 0
  }
  const projectId = Types.ObjectId.isValid(e.projectKey) ? new Types.ObjectId(e.projectKey) : undefined
  const common = {
    ...(projectName ? { projectName } : {}),
    ...(projectId ? { projectId } : {}),
    ...(userName ? { userName } : {}),
  }
  const update = e.mode === 'add'
    ? {
        $inc: { hours: e.hours },
        $set: common,
        ...(e.eventId ? { $addToSet: { eventIds: e.eventId } } : {}),
        $setOnInsert: { source: 'chat' },
      }
    : {
        $set: { hours: e.hours, ...common },
        $setOnInsert: { source: 'chat' },
      }
  const doc = await TimeEntry.findOneAndUpdate(filter, update, { upsert: true, new: true, runValidators: true })
  return doc?.hours ?? e.hours
}

const round25 = (n: number) => Math.round(n * 4) / 4

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY || !process.env.MONGODB_URI) {
    return NextResponse.json({ error: 'Hours chat is not configured on this server.' }, { status: 503 })
  }

  const body = await req.json().catch(() => null) as { messages?: ChatTurn[]; context?: ChatContext } | null
  const context = body?.context
  const history = (body?.messages ?? [])
    .filter((m): m is ChatTurn => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-MAX_TURNS)
    .map((m) => ({ ...m, content: m.content.slice(0, MAX_MSG_LEN) }))
  if (!context || !Array.isArray(context.projects) || history.length === 0 || history[history.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'messages (ending with a user turn) and context are required' }, { status: 400 })
  }

  // Valid targets: the internal row + every project the client knows about.
  const projectByKey = new Map<string, ContextProject>()
  for (const p of context.projects.slice(0, 500)) {
    if (typeof p?.key === 'string' && p.key) projectByKey.set(p.key, p)
  }
  projectByKey.set(INTERNAL_KEY, { key: INTERNAL_KEY, number: '', name: 'EasyBIM internal', roles: [] })

  const subjects = TAXONOMY.map((t) => t.subject)
  const allSubtopics = [...new Set(TAXONOMY.flatMap((t) => [...t.subtopics]))]

  const tool = {
    name: 'log_hours',
    description:
      'Apply working-hour entries for the signed-in user and answer them. Call exactly once per user message; ' +
      'use entries: [] when only replying or asking a clarification.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        reply: {
          type: 'string',
          description: 'Short chat reply in the user\'s language: what was logged, or one clarifying question.',
        },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              projectKey: { type: 'string', enum: [...projectByKey.keys()] },
              subject: { type: 'string', enum: subjects },
              subtopic: { type: 'string', enum: allSubtopics },
              hours: { type: 'number', description: '0–24 in 0.25 steps; 0 with mode "set" clears the slot' },
              mode: { type: 'string', enum: ['add', 'set'] },
              eventId: {
                type: ['string', 'null'],
                description: 'Calendar event id when this entry logs an event, else null',
              },
            },
            required: ['date', 'projectKey', 'subject', 'subtopic', 'hours', 'mode', 'eventId'],
            additionalProperties: false,
          },
        },
      },
      required: ['reply', 'entries'],
      additionalProperties: false,
    },
  }

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [tool],
      messages: [
        {
          role: 'user',
          content: `<context>${JSON.stringify({
            days: context.days,
            today: context.today,
            projects: [...projectByKey.values()].map((p) => `${p.key}|${p.number}|${p.name}|${p.roles.join(',')}`),
            entries: context.entries ?? [],
            events: context.events ?? [],
          })}</context>`,
        },
        { role: 'assistant', content: 'Understood — I have the current context and will log hours via log_hours.' },
        ...history,
      ],
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ reply: 'לא הצלחתי לטפל בבקשה הזו — נסו לנסח אחרת.', applied: [] })
    }

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim()

    if (!toolUse) {
      // Model chose to just talk (shouldn't happen with the instruction, but harmless).
      return NextResponse.json({ reply: text || '…', applied: [] })
    }

    const input = toolUse.input as { reply?: string; entries?: PlannedEntry[] }
    const planned = Array.isArray(input.entries) ? input.entries.slice(0, 60) : []

    // Server-side validation on top of the strict schema: dates, hour bounds,
    // subject↔subtopic pairing, internal↔project subject guard.
    const applied: Array<{ date: string; projectKey: string; projectName: string; subject: string; subtopic: string; hours: number; mode: string }> = []
    const loggedEventIds: string[] = []
    const userName = await displayName(userId)

    for (const e of planned) {
      if (!DATE_RE.test(e.date ?? '')) continue
      const proj = projectByKey.get(e.projectKey ?? '')
      if (!proj) continue
      const hours = round25(Number(e.hours))
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) continue
      if (e.mode !== 'set' && e.mode !== 'add') continue
      if (e.mode === 'add' && hours <= 0) continue
      const tax = TAXONOMY.find((t) => t.subject === e.subject)
      if (!tax || !(tax.subtopics as readonly string[]).includes(e.subtopic)) continue
      const isInternal = e.projectKey === INTERNAL_KEY
      if (isInternal !== (e.subject === 'EasyBIM Internal')) continue

      const finalHours = await applyEntry(userId, userName, isInternal ? undefined : proj.name, { ...e, hours })
      applied.push({
        date: e.date, projectKey: e.projectKey, projectName: proj.name,
        subject: e.subject, subtopic: e.subtopic, hours: finalHours, mode: e.mode,
      })
      if (e.eventId) loggedEventIds.push(e.eventId)
    }

    const reply = (typeof input.reply === 'string' && input.reply.trim()) || text ||
      (applied.length ? 'נרשם ✓' : 'לא זיהיתי מה לרשום — אפשר לנסח שוב?')
    return NextResponse.json({ reply, applied, loggedEventIds })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/me/hours-chat]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
