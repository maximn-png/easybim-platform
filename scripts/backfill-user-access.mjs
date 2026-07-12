// One-time backfill: grant existing Clerk users full card access so nobody is
// locked out when per-card enforcement deploys. Deny-by-default applies only
// to users created after this runs (invitations carry their grants).
//
// Usage (from repo root):
//   node scripts/backfill-user-access.mjs --dry-run   # preview only
//   node scripts/backfill-user-access.mjs             # apply
//
// Reads CLERK_SECRET_KEY from the environment, falling back to
// apps/portal/.env.local.

import { createClerkClient } from '@clerk/backend'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry-run')

const ALL_APPS = ['newsletter', 'epm', 'knowledge', 'agents']
const ADMIN_EMAILS = ['maxim.n@easybim.co.il']

function loadSecretKey() {
  if (process.env.CLERK_SECRET_KEY) return process.env.CLERK_SECRET_KEY
  try {
    const env = readFileSync(path.join(ROOT, 'apps/portal/.env.local'), 'utf8')
    const match = env.match(/^CLERK_SECRET_KEY=(.+)$/m)
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  } catch {}
  console.error('CLERK_SECRET_KEY not found in env or apps/portal/.env.local')
  process.exit(1)
}

const clerk = createClerkClient({ secretKey: loadSecretKey() })

const { data: users, totalCount } = await clerk.users.getUserList({ limit: 500 })
console.log(`Found ${totalCount} user(s)${DRY_RUN ? ' — DRY RUN, no changes will be made' : ''}\n`)

for (const user of users) {
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    '(no email)'
  const current = user.publicMetadata ?? {}
  const wantAdmin = ADMIN_EMAILS.includes(email.toLowerCase()) || current.admin === true
  const wantApps = Array.isArray(current.apps) && current.apps.length > 0
    ? current.apps
    : ALL_APPS

  const changed =
    current.admin !== wantAdmin ||
    JSON.stringify(current.apps ?? null) !== JSON.stringify(wantApps)

  const label = `${email} → admin=${wantAdmin}, apps=[${wantApps.join(', ')}]`
  if (!changed) {
    console.log(`  = unchanged  ${label}`)
    continue
  }
  if (DRY_RUN) {
    console.log(`  ~ would set  ${label}`)
    continue
  }
  await clerk.users.updateUserMetadata(user.id, {
    publicMetadata: { admin: wantAdmin, apps: wantApps },
  })
  console.log(`  ✓ updated    ${label}`)
}

console.log('\nDone.')
