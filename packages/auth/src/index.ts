// Shared Clerk auth helpers — import into any app with:
//   import { resolveAccess, canAccessApp } from '@easybim/auth'

export {
  accessFromClaims,
  resolveAccess,
  isAdmin,
  canAccessApp,
} from './access'
export type { AccessMetadata, AppId } from './access'
