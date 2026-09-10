import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { ISyncguardAgent } from '@/app/models/SyncguardAgent'
import type { Model, HydratedDocument } from 'mongoose'

// Bearer-token auth for the Syncguard workstation agent. Deliberately NOT Clerk:
// the agent is a headless process on a workstation with no browser session, so
// it authenticates as a machine. Its token is minted once at enrollment and only
// the hash is persisted (docs/SYNCGUARD_PLAN.md).

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

// 32 bytes of base64url — long enough that the hash is the only thing worth
// storing and short enough to paste into an installer prompt.
export const mintToken = (): string => randomBytes(32).toString('base64url')

// Human-typable pairing code. Ambiguous characters (0/O, 1/I/L) are excluded
// because someone reads this off a screen and types it on another machine.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function mintPairingCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
    if (i === 3) out += '-'
  }
  return out
}

// Constant-time compare so a wrong code can't be narrowed by timing.
export function codesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function bearerFrom(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1] : null
}

/**
 * The agent behind this request, or null.
 *
 * Rejects agents that are disabled or not fully enrolled, so an admin flipping
 * `enabled` takes effect on the very next call without revoking the token.
 */
export async function authenticateAgent(
  req: NextRequest,
  AgentModel: Model<ISyncguardAgent>,
): Promise<HydratedDocument<ISyncguardAgent> | null> {
  const token = bearerFrom(req)
  if (!token) return null
  const agent = await AgentModel.findOne({ tokenHash: hashToken(token), enrolled: true, enabled: true })
  return agent ?? null
}
