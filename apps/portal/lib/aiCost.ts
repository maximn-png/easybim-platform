// USD per 1M tokens — Anthropic first-party API rates. All agent runs are
// currently billed at the opus-4-8 rate (agents runtime pins that model);
// revisit if the agents app ever mixes models.
export const MODEL_RATES = {
  'claude-opus-4-8': { inputPer1M: 5, outputPer1M: 25 },
} as const

const DEFAULT_RATE = MODEL_RATES['claude-opus-4-8']

export function estimateCostUSD(inputTokens = 0, outputTokens = 0): number {
  return (inputTokens / 1_000_000) * DEFAULT_RATE.inputPer1M
    + (outputTokens / 1_000_000) * DEFAULT_RATE.outputPer1M
}
