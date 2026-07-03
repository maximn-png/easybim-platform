import { AgentDefinition } from '@/lib/core/types'
import { squirrelTools } from './tools'

// Squirrel — the EasyBIM price-quote management agent.
// Setup pass (Monday webhook on a new Type-C item with a quote number) builds the
// project folders, copies the Type-C template, collects the received materials,
// writes the links back to Monday, and proposes an initial work-scope for review.
export const squirrel: AgentDefinition = {
  key: 'squirrel',
  name: 'Squirrel',
  description:
    'Autonomous price-quote setup agent for EasyBIM. On a new Type-C quote it builds the Drive project, collects the client materials, links everything on Monday, and proposes a work-scope.',
  tools: squirrelTools,
}

export { SETUP_SYSTEM, setupInstruction, QUOTE_STRUCTURE } from './prompts'
export { squirrelTools } from './tools'
