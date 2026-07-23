// Peacock's tool set for automated passes (author cron). Posts now live in the
// local content-plan store (see posts.ts) — Monday is no longer used. Drive tools
// let the agent pull real project material and marketing assets.
import { driveTools } from './driveTools'
import { makePostTools } from './posts'

// Author/cron tools: no bound userId. Chat builds its own set in chat.ts.
export const peacockTools = [...driveTools, ...makePostTools()]
