import 'server-only'
import crypto from 'crypto'

// Symmetric encryption for OAuth refresh tokens at rest (AES-256-GCM).
//
// The key comes from APS_TOKEN_ENC_KEY — 32 bytes as hex (64 chars) or base64.
// Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// If the variable isn't set, values are stored as-is and flagged `enc:false`, so
// the feature still works on a deploy that hasn't added the key yet. Reads
// handle both shapes, so adding the key later needs no migration.

function key(): Buffer | null {
  const raw = process.env.APS_TOKEN_ENC_KEY?.trim()
  if (!raw) return null
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    console.warn('[secretBox] APS_TOKEN_ENC_KEY must decode to 32 bytes — storing tokens unencrypted')
    return null
  }
  return buf
}

export const encryptionEnabled = () => key() !== null

// → { value, enc }. `value` is "iv:tag:ciphertext" (base64 parts) when encrypted.
export function seal(plain: string): { value: string; enc: boolean } {
  const k = key()
  if (!k) return { value: plain, enc: false }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { value: `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`, enc: true }
}

// Returns null when the value can't be decrypted (rotated/incorrect key), so
// callers can treat it as "no token" and prompt a reconnect.
export function open(value: string, enc: boolean): string | null {
  if (!enc) return value
  const k = key()
  if (!k) return null
  try {
    const [ivB64, tagB64, ctB64] = value.split(':')
    if (!ivB64 || !tagB64 || !ctB64) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
