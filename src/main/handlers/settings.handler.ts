// src/main/handlers/settings.handler.ts
import type { DB } from '../database/connection'
import { dialog, app }  from 'electron'
import fs               from 'node:fs'
import path             from 'node:path'
import { safeHandle }   from '../utils/safeHandle'
import * as settingsService from '../services/settingsService'
import { testEmail }         from '../mailer/mailerService'
import { performBackup }     from '../mailer/mailerService'
import { CH }           from '@shared/ipcChannels'
import logger           from '../utils/logger'

export function registerSettingsHandlers(db: DB): void {
  safeHandle(CH.SETTINGS_GET, () =>
    settingsService.getAllSettings(db))

  safeHandle(CH.SETTINGS_SET, (_e, key: string, value: string) =>
    settingsService.setSetting(db, key, value))

  safeHandle(CH.PROFILE_GET, () =>
    settingsService.getBusinessProfile(db))

  safeHandle(CH.PROFILE_SAVE, (_e, data) =>
    settingsService.saveBusinessProfile(db, data))

  // ── Printers ────────────────────────────────────────
  safeHandle(CH.SETTINGS_LIST_PRINTERS, async (_e, event) => {
    // Get from webContents (renderer must invoke from a window)
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => p.name)
  })

  // ── Backup ──────────────────────────────────────────
  safeHandle(CH.SETTINGS_BACKUP, async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save NovaPOS Backup',
      defaultPath: `novapos-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return null

    const dbPath = path.join(app.getPath('userData'), 'novapos.db')
    fs.copyFileSync(dbPath, result.filePath)
    logger.info(`[Settings] Backup saved to: ${result.filePath}`)
    return result.filePath
  })

  // ── Restore ─────────────────────────────────────────
  safeHandle(CH.SETTINGS_RESTORE, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Restore NovaPOS Backup',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null

    const dbPath = path.join(app.getPath('userData'), 'novapos.db')
    // Close current DB before overwriting
    db.close()
    fs.copyFileSync(result.filePaths[0], dbPath)
    logger.warn('[Settings] Database restored from backup — restarting app')
    app.relaunch()
    app.exit(0)
  })

  // ── Test email (from setup wizard or Settings page) ──
  safeHandle(CH.SETTINGS_TEST_EMAIL, async (_e, config) => {
    await testEmail(config)
  })

  // ── Scheduled backup now ─────────────────────────────
  safeHandle('settings:backupNow', async () => {
    const result = await performBackup()
    return result
  })
}
