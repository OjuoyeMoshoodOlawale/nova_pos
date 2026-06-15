// tests/backup.test.ts
// Round-trip test for the AES-256-GCM backup format used by both the
// "Backup Now" button and the auto-backup scheduler. This is the same
// algorithm as settings.handler.ts / mailerService.ts.
import { describe, it, expect } from 'vitest'
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const MAGIC = 'NOVA', VERSION = 0x01, NONCE_LEN = 12, TAG_LEN = 16
const HEADER_LEN = 4 + 1 + NONCE_LEN + TAG_LEN

function deriveKey(licenceKey: string): Buffer {
  return createHash('sha256').update(`${licenceKey}:nova-pos-encrypted-backup-v1`).digest()
}
function encrypt(plain: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LEN)
  const c = createCipheriv('aes-256-gcm', key, nonce)
  const enc = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([Buffer.from(MAGIC), Buffer.from([VERSION]), nonce, c.getAuthTag(), enc])
}
function decrypt(blob: Buffer, key: Buffer): Buffer {
  if (blob.slice(0, 4).toString() !== MAGIC) throw new Error('bad magic')
  const nonce = blob.slice(5, 5 + NONCE_LEN)
  const tag = blob.slice(5 + NONCE_LEN, HEADER_LEN)
  const d = createDecipheriv('aes-256-gcm', key, nonce)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(blob.slice(HEADER_LEN)), d.final()])
}

describe('backup encryption round-trip', () => {
  const key = deriveKey('NOVA-1234-ABCD')
  const original = Buffer.from('SQLite format 3\0 ...fake db bytes...')

  it('decrypts back to the original bytes', () => {
    expect(decrypt(encrypt(original, key), key).equals(original)).toBe(true)
  })

  it('writes the NOVA magic header', () => {
    expect(encrypt(original, key).slice(0, 4).toString()).toBe('NOVA')
  })

  it('fails to decrypt with the wrong licence key', () => {
    const blob = encrypt(original, key)
    expect(() => decrypt(blob, deriveKey('NOVA-WRONG-KEY'))).toThrow()
  })

  it('fails to decrypt a tampered blob', () => {
    const blob = encrypt(original, key)
    blob[HEADER_LEN + 2] ^= 0xff   // flip a ciphertext byte
    expect(() => decrypt(blob, key)).toThrow()
  })

  it('same licence key on another machine derives the same key', () => {
    expect(deriveKey('NOVA-1234-ABCD').equals(deriveKey('NOVA-1234-ABCD'))).toBe(true)
  })
})
