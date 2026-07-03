import { AgentDefinition } from './types'
import { peacock } from '@/lib/agents/peacock'
import { squirrel } from '@/lib/agents/squirrel'

// Register every agent here. The dashboard (Phase 2) and any generic tooling
// iterate this map; routes can also import an agent module directly.
export const AGENTS: Record<string, AgentDefinition> = {
  [peacock.key]: peacock,
  [squirrel.key]: squirrel,
}

export function getAgent(key: string): AgentDefinition | undefined {
  return AGENTS[key]
}

export function listAgents(): AgentDefinition[] {
  return Object.values(AGENTS)
}
