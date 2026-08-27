import { getCrossDbConnection } from '@easybim/db'
import AgentRuns, { type AgentRunRow, type DailyStat } from './AgentRuns'

// Agent Runs & AI cost — cross-DB read of easybim-agents.agent_runs
// (written by the agents app's runtime for Peacock / Squirrel / Dog).
export const dynamic = 'force-dynamic'

export default async function AgentRunsPage() {
  let runs: AgentRunRow[] = []
  let stats: DailyStat[] = []
  let loadError: string | null = null

  try {
    const conn = await getCrossDbConnection('easybim-agents')
    const col = conn.collection('agent_runs')
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [runDocs, statDocs] = await Promise.all([
      // context is excluded — it's a free-form payload that can be very large.
      col
        .find({}, {
          sort: { startedAt: -1 },
          limit: 200,
          projection: {
            agentKey: 1, trigger: 1, pass: 1, status: 1, summary: 1, error: 1,
            inputTokens: 1, outputTokens: 1, startedAt: 1, finishedAt: 1,
          },
        })
        .toArray(),
      col
        .aggregate([
          { $match: { startedAt: { $gte: since } } },
          {
            $group: {
              _id: {
                agentKey: '$agentKey',
                day: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
              },
              inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
              outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
              runs: { $sum: 1 },
              errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
            },
          },
          { $sort: { '_id.day': 1 } },
        ])
        .toArray(),
    ])

    runs = runDocs.map((d) => ({
      id: String(d._id),
      agentKey: (d.agentKey as string) ?? '?',
      trigger: (d.trigger as string) ?? '?',
      pass: (d.pass as string) ?? '',
      status: (d.status as string) ?? '?',
      summary: (d.summary as string) ?? '',
      error: (d.error as string) ?? null,
      inputTokens: (d.inputTokens as number) ?? 0,
      outputTokens: (d.outputTokens as number) ?? 0,
      startedAt: d.startedAt ? new Date(d.startedAt as Date).getTime() : 0,
      finishedAt: d.finishedAt ? new Date(d.finishedAt as Date).getTime() : null,
    }))

    stats = statDocs.map((d) => {
      const id = d._id as { agentKey: string; day: string }
      return {
        agentKey: id.agentKey ?? '?',
        day: id.day,
        inputTokens: (d.inputTokens as number) ?? 0,
        outputTokens: (d.outputTokens as number) ?? 0,
        runs: (d.runs as number) ?? 0,
        errors: (d.errors as number) ?? 0,
      }
    })
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-1" style={{ color: '#1e248c' }}>Agent Runs &amp; AI Cost</h1>
      <p className="text-sm mb-5" style={{ color: '#6b7280' }}>
        Every Peacock, Squirrel and Dog run — failures, stuck runs and token spend (last 30 days).
      </p>
      {loadError ? (
        <div className="bg-white/65 border border-white/90 rounded-2xl p-8 text-center text-sm" style={{ color: '#b91c1c' }}>
          Could not read agent runs: {loadError}
        </div>
      ) : (
        <AgentRuns runs={runs} stats={stats} />
      )}
    </div>
  )
}
