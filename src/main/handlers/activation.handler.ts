// src/main/handlers/activation.handler.ts
import type { DB } from '../database/connection'
import { safeHandle }           from '../utils/safeHandle'
import * as activationService   from '../services/activationService'
import { getMachineId }         from '../utils/machineId'
import { CH }                   from '@shared/ipcChannels'

export function registerActivationHandlers(db: DB): void {
  safeHandle(CH.ACTIVATION_STATUS, () =>
    activationService.getActivationStatus(db))

  safeHandle(CH.ACTIVATION_MACHINE, () =>
    getMachineId())

  safeHandle(CH.ACTIVATION_ACTIVATE, (_e, key: string, businessName: string) =>
    activationService.activate(db, key, businessName))
}
