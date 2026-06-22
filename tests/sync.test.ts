// tests/sync.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSupabaseUrl } from '../src/main/services/syncService'

describe('normalizeSupabaseUrl', () => {
  it('expands a bare project ref to a full supabase.co URL', () => {
    expect(normalizeSupabaseUrl('nudsekjknfuumlitgyby'))
      .toBe('https://nudsekjknfuumlitgyby.supabase.co')
  })

  it('adds https:// to a scheme-less host', () => {
    expect(normalizeSupabaseUrl('abc.supabase.co')).toBe('https://abc.supabase.co')
  })

  it('leaves a full URL intact and strips trailing slashes', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('http://localhost:54321')).toBe('http://localhost:54321')
  })

  it('trims whitespace', () => {
    expect(normalizeSupabaseUrl('  myref  ')).toBe('https://myref.supabase.co')
  })

  it('returns empty for empty input', () => {
    expect(normalizeSupabaseUrl('')).toBe('')
    expect(normalizeSupabaseUrl('   ')).toBe('')
  })
})
