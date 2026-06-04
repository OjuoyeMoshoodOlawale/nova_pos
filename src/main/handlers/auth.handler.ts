// src/main/handlers/auth.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import * as authService from '../services/authService'
import { CH } from '@shared/ipcChannels'

export function registerAuthHandlers(db: DB): void {
  safeHandle(CH.AUTH_LOGIN, (_e, username: string, password: string) =>
    authService.login(db, username, password))

  safeHandle(CH.AUTH_LOGOUT, (_e, token: string) =>
    authService.logout(token))

  safeHandle(CH.AUTH_ME, (_e, token: string) =>
    authService.getSession(token))

  safeHandle(CH.AUTH_CHANGE_PASS, (_e, userId: number, oldPass: string, newPass: string) =>
    authService.changePassword(db, userId, oldPass, newPass))
}
