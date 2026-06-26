// UI-only metadata for agents (emoji, accent color, tagline). Keeps the core
// AgentDefinition logic-only; the Kingdom page and dashboards read from here.
export interface AgentPresentation {
  emoji: string
  accent: string
  tagline: string
  /** Short "why this animal" note connecting the agent's job to the animal's trait. */
  why?: string
}

const MAP: Record<string, AgentPresentation> = {
  peacock: {
    emoji: '🦚',
    accent: '#7c3aed',
    tagline: 'LinkedIn & content',
    why: "Core trait: presence & shine. A peacock knows how to show up, stand out, and draw the eye — exactly the marketing brief: make EasyBIM impossible to scroll past, and turn every post into an event.",
  },
}

const FALLBACK: AgentPresentation = { emoji: '🐾', accent: '#44b8d3', tagline: 'Agent' }

export function getPresentation(key: string): AgentPresentation {
  return MAP[key] ?? FALLBACK
}
