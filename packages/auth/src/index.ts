// Shared Clerk auth helpers — import into any app with:
//   import { resolveAccess, canAccessApp } from '@easybim/auth'

export {
  accessFromClaims,
  resolveAccess,
  isAdmin,
  canAccessApp,
  resolveKnowledgeRole,
} from './access'
export type { AccessMetadata, AppId, KnowledgeRole } from './access'
