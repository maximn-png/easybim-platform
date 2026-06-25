import { AgentDefinition } from '@/lib/core/types'
import { peacockTools } from './tools'

// Peacock — the EasyBIM LinkedIn marketing agent.
// Author pass (weekly cron) drafts 2 posts to Monday; Watcher pass (Monday
// webhook on Approved/Revise) finalizes or revises.
export const peacock: AgentDefinition = {
  key: 'peacock',
  name: 'Peacock',
  description: 'Autonomous LinkedIn marketing agent for EasyBIM. Plans, drafts, and routes weekly posts through Monday.',
  tools: peacockTools,
}

export { AUTHOR_SYSTEM, WATCHER_SYSTEM, authorInstruction, watcherInstruction, buildDateContext } from './prompts'
export { peacockTools } from './tools'
