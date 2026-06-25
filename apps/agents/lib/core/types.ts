// Shared agent types. Every agent in apps/agents conforms to AgentDefinition
// so the runtime, routes, and (Phase 2) dashboard can treat agents uniformly.

// betaZodTool instances; typed loosely to avoid coupling core to Zod generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentTool = any

export interface AgentPass {
  /** stable id, e.g. "author" | "watcher" */
  key: string
  /** system prompt for this pass */
  system: string
}

export interface AgentDefinition {
  /** stable key, also the route namespace and agentKey in the DB, e.g. "peacock" */
  key: string
  /** display name, e.g. "Peacock" */
  name: string
  /** one-line description for the dashboard */
  description: string
  /** tools available to this agent across passes */
  tools: AgentTool[]
}
