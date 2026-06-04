// src/main/utils/encrypt.ts
// ─────────────────────────────────────────────────────────
// AES-256-GCM symmetric encryption for storing sensitive
// settings (SMTP password, LAN secret) in SQLite.
// Key is derived from the machine ID so it's unique per device.
// ─────────────────────────────────────────────────────────

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16

/**
 * Derive a 32-byte key from the machine ID.
 * The same machine always produces the same key, so encrypted
 * values survive app restarts but not machine migrations.
 */
export function deriveKey(machineId: string): Buffer {
  return createHash('sha256')
    .update(machineId + '-nova-pos-key-v1')
    .digest()
    .subarray(0, KEY_LEN)
}

/**
 * Encrypt a plaintext string.
 * Output format: "<iv_hex>:<tag_hex>:<ciphertext_hex>"
 */
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt a value produced by encrypt().
 * Returns null if the input is empty or decryption fails.
 */
export function decrypt(stored: string, key: Buffer): string | null {
  if (!stored || !stored.includes(':')) return null
  try {
    const parts = stored.split(':')
    if (parts.length !== 3) return null
    const [ivHex, tagHex, cipherHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const ciphertext = Buffer.from(cipherHex, 'hex')
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
  } catch {
    return null
  }
}
