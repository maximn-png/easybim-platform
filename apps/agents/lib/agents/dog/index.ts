import { AgentDefinition } from '@/lib/core/types'

export const AGENT_KEY = 'dog'

// 🐕 Dog — the EasyBIM contracts agent (Treasury house).
// Phase 1: agreement review. You pick a project folder; Dog finds the agreement
// in חוזה and the quote we sent in הצעות מחיר, compares them against an editable
// checklist, and writes its findings into a table you edit in the dashboard.
// No chat tools yet — the review runs from the dashboard, not from a chat turn.
export const dog: AgentDefinition = {
  key: AGENT_KEY,
  name: 'Dog',
  description:
    "Contracts agent for EasyBIM. Reviews an agreement received from a client against the price quote we sent, and reports the misalignments and legal exposures as findings you edit and send.",
  tools: [],
}

// Nothing is re-exported here on purpose: checklist.ts and review.ts import
// AGENT_KEY from this module, so re-exporting them back would make the cycle.
