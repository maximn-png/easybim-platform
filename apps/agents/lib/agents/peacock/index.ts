import { AgentDefinition } from '@/lib/core/types'
import { peacockTools } from './tools'

// Peacock — the EasyBIM LinkedIn marketing agent.
// Author pass (weekly cron) drafts 2 posts into the local content plan; posts are
// planned/reviewed on the web dashboard and published to LinkedIn manually.
export const peacock: AgentDefinition = {
  key: 'peacock',
  name: 'Peacock',
  description: 'Autonomous LinkedIn marketing agent for EasyBIM. Plans and drafts posts, pulls project + marketing material from Drive, and tracks the content plan.',
  tools: peacockTools,
}

export { authorSystem, authorInstruction, buildDateContext } from './prompts'
export { getContentPlan, saveContentPlan, isAutopilotOff, normalizePlan, DEFAULT_PLAN, MAX_POSTS_PER_WEEK } from './plan'
export type { ContentPlan } from './plan'
export { peacockTools } from './tools'
