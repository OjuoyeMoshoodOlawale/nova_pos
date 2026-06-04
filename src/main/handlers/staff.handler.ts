// src/main/handlers/staff.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import * as authService from '../services/authService'
import { CH } from '@shared/ipcChannels'

export function registerStaffHandlers(db: DB): void {
  safeHandle(CH.STAFF_ALL,        ()             => authService.getAllUsers(db))
  safeHandle(CH.STAFF_CREATE,     (_e, dto)      => authService.createUser(db, dto))
  safeHandle(CH.STAFF_UPDATE,     (_e, id, data) => authService.updateUser(db, id, data))
  safeHandle(CH.STAFF_DEACTIVATE, (_e, id: number)=> authService.deactivateUser(db, id))
}
