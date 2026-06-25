import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_SECRET
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_SECRET must be a 64-char hex string (32 bytes)')
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(stored: string): string {
  try {
    const [ivHex, tagHex, dataHex] = stored.split(':')
    if (!ivHex || !tagHex || !dataHex) return ''
    const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8')
  } catch {
    return ''
  }
}

export function isEncrypted(value: string): boolean {
  return value.split(':').length === 3
}
