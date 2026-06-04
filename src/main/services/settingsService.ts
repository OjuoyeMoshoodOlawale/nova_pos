// src/main/services/settingsService.ts
import type { DB } from '../database/connection'
import { BusinessProfile, CreateBusinessProfileDto } from '@shared/types'
import { getMachineId } from '../utils/machineId'
import { deriveKey, encrypt, decrypt } from '../utils/encrypt'

const ENCRYPTED_KEYS = new Set(['smtp_pass', 'lan_secret'])

function getKey() {
  return deriveKey(getMachineId())
}

// ─── Settings ────────────────────────────────────────────
export function getSetting(db: DB, key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get([key]) as
    | { value: string } | undefined
  const raw = row?.value ?? ''
  return ENCRYPTED_KEYS.has(key) && raw ? (decrypt(raw, getKey()) ?? '') : raw
}

export function setSetting(db: DB, key: string, value: string): void {
  const stored = ENCRYPTED_KEYS.has(key) && value ? encrypt(value, getKey()) : value
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run([key, stored])
}

export function getAllSettings(db: DB): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as
    { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const { key, value } of rows) {
    result[key] = ENCRYPTED_KEYS.has(key) && value ? (decrypt(value, getKey()) ?? '') : (value ?? '')
  }
  return result
}

export function isSetupComplete(db: DB): boolean {
  return getSetting(db, 'setup_complete') === 'true'
}

// ─── Business profile ────────────────────────────────────
export function getBusinessProfile(db: DB): BusinessProfile | null {
  const row = db.prepare('SELECT * FROM business_profile WHERE id = 1').get() as
    | (BusinessProfile & { tax_inclusive: number; show_logo: number }) | undefined
  if (!row) return null
  return { ...row, tax_inclusive: Boolean(row.tax_inclusive), show_logo: Boolean(row.show_logo) }
}

export function saveBusinessProfile(db: DB, data: CreateBusinessProfileDto): BusinessProfile {
  // All 14 value params in INSERT order, repeated for UPSERT excluded.*
  db.prepare(`
    INSERT INTO business_profile (
      id, name, type, address, phone, email, logo_path,
      currency_code, currency_symbol,
      tax_name, tax_rate, tax_inclusive,
      receipt_header, receipt_footer, show_logo, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name            = excluded.name,
      type            = excluded.type,
      address         = excluded.address,
      phone           = excluded.phone,
      email           = excluded.email,
      logo_path       = excluded.logo_path,
      currency_code   = excluded.currency_code,
      currency_symbol = excluded.currency_symbol,
      tax_name        = excluded.tax_name,
      tax_rate        = excluded.tax_rate,
      tax_inclusive   = excluded.tax_inclusive,
      receipt_header  = excluded.receipt_header,
      receipt_footer  = excluded.receipt_footer,
      show_logo       = excluded.show_logo,
      updated_at      = datetime('now')
  `).run([
    data.name,             data.type,             data.address,
    data.phone,            data.email,            data.logo_path,
    data.currency_code,    data.currency_symbol,
    data.tax_name,         data.tax_rate,         data.tax_inclusive ? 1 : 0,
    data.receipt_header,   data.receipt_footer,   data.show_logo ? 1 : 0,
  ])
  return getBusinessProfile(db)!
}
