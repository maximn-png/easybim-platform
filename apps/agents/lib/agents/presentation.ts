// UI-only metadata for agents (emoji, accent color, tagline). Keeps the core
// AgentDefinition logic-only; the Kingdom page and dashboards read from here.
export interface AgentPresentation {
  emoji: string
  accent: string
  tagline: string
}

const MAP: Record<string, AgentPresentation> = {
  peacock: { emoji: '🦚', accent: '#7c3aed', tagline: 'LinkedIn & content' },
}

const FALLBACK: AgentPresentation = { emoji: '🐾', accent: '#44b8d3', tagline: 'Agent' }

export function getPresentation(key: string): AgentPresentation {
  return MAP[key] ?? FALLBACK
}
