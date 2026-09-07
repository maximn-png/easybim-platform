// Chat tools for the two dashboard cards, so asking Squirrel a question and
// reading the card give the same numbers rather than two versions of the truth.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { buildCompletedAnalytics } from './completed'
import { buildClientAnalytics, PARTIES } from './clients'

const PARTY_ENUM = ['developer', 'projectManagement', 'workOrderer', 'developerContact', 'projectManagerContact', 'workOrdererContact'] as const

export const completedProjectsAnalytics = betaZodTool({
  name: 'completed_projects_analytics',
  description:
    'Hours performance of the COMPLETED projects (MA-004 Status = DONE), grouped by סוג פרויקט and split by department (ניהול מודל / תאום מערכות / מידול). For each project: the hour bank it was paid for (₪ ÷ 300), the hours actually logged, and the office כדאיות verdict (++ under fee/300, + acceptable, − past fee/225). Use for "how did Type C projects go?", "which project type loses us hours?", "how much did תאום מערכות overspend on finished work?", and for planning a new project of a given type.',
  inputSchema: z.object({
    projectTypes: z.array(z.string()).optional().describe('limit to these סוג פרויקט values, e.g. ["C"]'),
    includeProjects: z
      .boolean()
      .optional()
      .describe('include the per-project rows (default true). Set false for just the group totals.'),
    refresh: z.boolean().optional().describe('re-read MA-004 from Monday instead of the 5-minute memo'),
  }),
  run: async ({ projectTypes, includeProjects, refresh }) => {
    const data = await buildCompletedAnalytics({ projectTypes, refresh })
    const projects = (includeProjects ?? true)
      ? data.projects.map((p) => ({
          projectNumber: p.projectNumber,
          name: p.name,
          projectType: p.projectType,
          usageType: p.usageType,
          fee: p.fee,
          bankHours: p.total.bank,
          spentHours: p.total.spent,
          pct: p.total.pct,
          verdict: p.total.verdict,
          boardViability: p.boardViability,
          months: p.months,
          departments: p.departments.map((d) => ({
            department: d.label,
            bank: d.bank,
            spent: d.spent,
            pct: d.pct,
            verdict: d.verdict,
          })),
          uncountedHours: p.uncountedHours,
          hasHours: p.hasHours,
          quoteNumber: p.quote?.quoteNumber ?? null,
          mondayUrl: p.mondayUrl,
        }))
      : undefined

    return JSON.stringify({
      verdictRule: 'good = spent < fee/300 · ok = up to fee/225 · over = past fee/225 (MA-004 כדאיות)',
      totals: data.totals,
      byType: data.byType,
      byDepartment: data.byDepartment,
      ...(projects ? { projects } : {}),
      projectsWithoutTimesheet: data.missingHours,
      uncountedSubjectsNote:
        'Hours on Subjects not assigned to a department are excluded from every bank — see totals.uncountedHours.',
    })
  },
})

export const clientAnalytics = betaZodTool({
  name: 'client_analytics',
  description:
    'Quote health per party: how many quotes each client asked for, how many were approved vs declined, win rate, ₪ won vs lost, when they last asked for a quote, how fast they answer, and flags (3+ declines in a row, gone quiet for 5+ months, never won). Group by any of the six MA-001 parties. Use for "which clients went quiet?", "who declines everything?", "what is our win rate with X?", "which project manager sends us the most work?".',
  inputSchema: z.object({
    party: z
      .enum(PARTY_ENUM)
      .optional()
      .describe(`grouping party (default developer = יזם ראשי). ${PARTIES.map((p) => `${p.key}=${p.hebrew}`).join(', ')}`),
    sinceMonths: z.number().optional().describe('only quotes sent in the last N months (default: all time)'),
    minQuotes: z.number().optional().describe('drop parties with fewer than N quotes'),
    onlyAttention: z.boolean().optional().describe('return only the flagged parties (the follow-up list)'),
    limit: z.number().optional().describe('max rows returned, default 40'),
  }),
  run: async ({ party, sinceMonths, minQuotes, onlyAttention, limit }) => {
    const data = await buildClientAnalytics({ party, sinceMonths, minQuotes })
    const source = onlyAttention ? data.attention : data.rows
    // Drop the per-quote lists — they blow the context for little gain; the chat
    // can follow up with query_quotes for a specific client's quotes.
    const rows = source.slice(0, Math.min(limit ?? 40, 100)).map(({ quotesList, ...r }) => {
      void quotesList
      return r
    })
    return JSON.stringify({
      groupedBy: `${data.partyLabel} (${data.partyHebrew})`,
      totals: data.totals,
      quotesWithNoValueInThisColumn: data.unassigned,
      flagRules: {
        losingStreak: '3+ consecutive declines (most recent decisions first)',
        coldContact: 'no quote sent in 5+ months',
        allDeclined: 'every decided quote declined',
        strong: 'win rate ≥ 50% and still active',
      },
      rows,
    })
  },
})

export const insightTools = [completedProjectsAnalytics, clientAnalytics]
