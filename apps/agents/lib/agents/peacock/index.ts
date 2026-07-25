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

export { AUTHOR_SYSTEM, authorInstruction, buildDateContext } from './prompts'
export { peacockTools } from './tools'
