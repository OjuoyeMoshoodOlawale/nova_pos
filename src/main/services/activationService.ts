// src/main/services/activationService.ts
import type { DB } from '../database/connection'
import { getMachineId, verifyActivationKey } from '../utils/machineId'
import { ActivationRecord } from '@shared/types'
import logger from '../utils/logger'

export interface ActivationStatus {
  activated: boolean
  machineId: string
  record: ActivationRecord | null
}

export function getActivationStatus(db: DB): ActivationStatus {
  const machineId = getMachineId()
  const row = db.prepare('SELECT * FROM activation WHERE id = 1').get() as
    | ActivationRecord
    | undefined

  if (!row) return { activated: false, machineId, record: null }

  const stillValid = row.machine_id === machineId && verifyActivationKey(row.activation_key)
  if (!stillValid) {
    logger.warn('[Activation] Stored key does not match current machine')
    return { activated: false, machineId, record: null }
  }

  return { activated: true, machineId, record: row }
}

export function activate(db: DB, key: string, businessName: string): ActivationRecord {
  if (!verifyActivationKey(key)) {
    throw new Error('Invalid activation key. Please contact your vendor.')
  }

  const machineId = getMachineId()

  // Positional params — order: machine_id, activation_key, business_name (x3 for UPSERT)
  db.prepare(`
    INSERT INTO activation (id, machine_id, activation_key, business_name)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      machine_id     = excluded.machine_id,
      activation_key = excluded.activation_key,
      business_name  = excluded.business_name,
      activated_at   = datetime('now')
  `).run([machineId, key.trim().toUpperCase(), businessName])

  logger.info(`[Activation] Software activated for: ${businessName}`)
  return db.prepare('SELECT * FROM activation WHERE id = 1').get() as ActivationRecord
}
