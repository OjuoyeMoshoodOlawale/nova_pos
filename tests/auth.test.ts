// tests/auth.test.ts
// Pure crypto + policy tests for authService (no DB needed).
import { describe, it, expect } from 'vitest'
import {
  hashPassword, verifyPassword, hashPin,
  validatePassword, validatePin,
} from '../src/main/services/authService'

describe('password hashing', () => {
  it('produces a salt:hash pair', () => {
    const stored = hashPassword('secret123')
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
  })

  it('verifies the correct password', () => {
    const stored = hashPassword('correct1')
    expect(verifyPassword('correct1', stored)).toBe(true)
  })

  it('rejects the wrong password', () => {
    const stored = hashPassword('correct1')
    expect(verifyPassword('wrong1', stored)).toBe(false)
  })

  it('uses a unique salt per hash (same input → different stored value)', () => {
    expect(hashPassword('same1')).not.toBe(hashPassword('same1'))
  })

  it('returns false for malformed stored value', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false)
  })
})

describe('PIN hashing', () => {
  it('produces a salt:hash pair', () => {
    expect(hashPin('1234')).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
  })
})

describe('password policy', () => {
  it('accepts a valid password (letter + number, 6+)', () => {
    expect(() => validatePassword('abc123')).not.toThrow()
  })
  it('rejects short passwords', () => {
    expect(() => validatePassword('a1')).toThrow(/at least 6/)
  })
  it('rejects all-letters', () => {
    expect(() => validatePassword('abcdef')).toThrow(/letter and one number/)
  })
  it('rejects all-numbers', () => {
    expect(() => validatePassword('123456')).toThrow(/letter and one number/)
  })
  it('rejects empty', () => {
    expect(() => validatePassword('')).toThrow()
  })
})

describe('PIN policy', () => {
  it('accepts 4-6 digit PINs', () => {
    expect(() => validatePin('1234')).not.toThrow()
    expect(() => validatePin('123456')).not.toThrow()
  })
  it('rejects too short / too long / non-numeric', () => {
    expect(() => validatePin('123')).toThrow()
    expect(() => validatePin('1234567')).toThrow()
    expect(() => validatePin('12ab')).toThrow()
  })
})
