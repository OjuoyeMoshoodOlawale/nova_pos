// src/main/handlers/settings.handler.ts
import type { DB }    from '../database/connection'
import { dialog, app, net, shell } from 'electron'
import fs             from 'node:fs'
import path           from 'node:path'
import { safeHandle } from '../utils/safeHandle'
import * as settingsService from '../services/settingsService'
import { testEmail, performBackup } from '../mailer/mailerService'
import { CH }         from '@shared/ipcChannels'
import logger         from '../utils/logger'

// ─── Backup retry state ───────────────────────────────────
// When a scheduled backup fails (e.g. no internet for email backup),
// this flag causes a retry the next time the app detects connectivity.
let _pendingBackupRetry = false

function scheduleRetryIfOffline() {
  // Poll every 2 minutes; if online and retry is pending, attempt backup
  setInterval(async () => {
    if (!_pendingBackupRetry) return
    if (net.isOnline()) {
      logger.info('[Settings] Network restored — retrying pending backup')
      _pendingBackupRetry = false
      try {
        await performBackup()
        logger.info('[Settings] Retry backup succeeded')
      } catch (e) {
        _pendingBackupRetry = true  // still failing — try again next poll
        logger.warn('[Settings] Retry backup failed again:', e)
      }
    }
  }, 2 * 60 * 1000)
}
scheduleRetryIfOffline()

// ─── Helpers ─────────────────────────────────────────────
function getDbPath()            { return path.join(app.getPath('userData'), 'novapos.db') }
function getDefaultBackupDir()  { return path.join(app.getPath('userData'), 'backups') }

export function registerSettingsHandlers(db: DB): void {

  safeHandle(CH.SETTINGS_GET, () => settingsService.getAllSettings(db))
  safeHandle(CH.SETTINGS_SET, (_e, key: string, value: string) => settingsService.setSetting(db, key, value))
  safeHandle(CH.PROFILE_GET,  () => settingsService.getBusinessProfile(db))
  safeHandle(CH.PROFILE_SAVE, (_e, data) => settingsService.saveBusinessProfile(db, data))

  // ── Printers ─────────────────────────────────────────
  safeHandle(CH.SETTINGS_LIST_PRINTERS, async () => {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => p.name)
  })

  // ── App paths (dynamic — shown in Settings UI) ────────
  // Returns the actual runtime paths so the UI never shows hardcoded paths.
  safeHandle('settings:getAppPaths', () => {
    const userData  = app.getPath('userData')
    const dbPath    = getDbPath()
    const backupDir = getDefaultBackupDir()
    return { userData, dbPath, backupDir }
  })

  // ── Browse for folder (native OS dialog) ─────────────
  safeHandle('settings:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      title:      'Choose Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  // ── Open a folder in OS file explorer ────────────────
  safeHandle('settings:openFolder', async (_e, folderPath: string) => {
    await shell.openPath(folderPath)
    return true
  })

  // ── Local backup (primary backup method) ─────────────
  // Copies the live DB to a timestamped file in the backup folder.
  // Optionally also copies to a Google Drive sync folder.
  // Rule: backup files live in the SAME parent directory as the DB
  //       (by default), unless the user overrides the path.
  safeHandle('settings:backupLocal', async (_e, opts: {
    backupDir:   string   // primary backup folder
    gdriveDir?:  string   // optional Google Drive sync folder
  }) => {
    const dbPath  = getDbPath()
    const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `novapos-backup-${ts}.db`

    // Ensure backup folder exists
    fs.mkdirSync(opts.backupDir, { recursive: true })
    const destPath = path.join(opts.backupDir, filename)
    fs.copyFileSync(dbPath, destPath)
    logger.info(`[Settings] Local backup saved: ${destPath}`)

    // Store last-backup time in settings DB
    settingsService.setSetting(db, 'last_backup_at', new Date().toISOString())
    settingsService.setSetting(db, 'last_backup_file', destPath)

    // Also sync to Google Drive folder if provided
    let gdriveCopied = false
    if (opts.gdriveDir) {
      try {
        fs.mkdirSync(opts.gdriveDir, { recursive: true })
        const gdriveDest = path.join(opts.gdriveDir, filename)
        fs.copyFileSync(dbPath, gdriveDest)
        gdriveCopied = true
        logger.info(`[Settings] Backup synced to GDrive folder: ${gdriveDest}`)
      } catch (e) {
        logger.warn('[Settings] Google Drive folder copy failed:', e)
      }
    }

    // Prune old backups: keep last 30 files in the backup dir
    try {
      const files = fs.readdirSync(opts.backupDir)
        .filter(f => f.startsWith('novapos-backup-') && f.endsWith('.db'))
        .sort()
      if (files.length > 30) {
        files.slice(0, files.length - 30).forEach(f => {
          fs.unlinkSync(path.join(opts.backupDir, f))
          logger.info(`[Settings] Pruned old backup: ${f}`)
        })
      }
    } catch { /* non-fatal */ }

    return { filePath: destPath, filename, gdriveCopied }
  })

  // ── Manual DB backup (opens Save dialog) ─────────────
  safeHandle(CH.SETTINGS_BACKUP, async () => {
    const result = await dialog.showSaveDialog({
      title:       'Save NovaPOS Backup',
      defaultPath: `novapos-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters:     [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return null
    fs.copyFileSync(getDbPath(), result.filePath)
    logger.info(`[Settings] Manual backup saved: ${result.filePath}`)
    return result.filePath
  })

  // ── Restore ───────────────────────────────────────────
  safeHandle(CH.SETTINGS_RESTORE, async () => {
    const result = await dialog.showOpenDialog({
      title:   'Restore NovaPOS Backup',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    db.close()
    fs.copyFileSync(result.filePaths[0], getDbPath())
    logger.warn('[Settings] Database restored — restarting')
    app.relaunch()
    app.exit(0)
  })

  // ── Email test ────────────────────────────────────────
  safeHandle(CH.SETTINGS_TEST_EMAIL, async (_e, config) => { await testEmail(config) })

  // ── Scheduled backup (called by auto-backup scheduler) ─
  safeHandle('settings:backupNow', async () => {
    try {
      const result = await performBackup()
      _pendingBackupRetry = false
      return result
    } catch (e: any) {
      // If network is the issue, queue a retry
      if (!net.isOnline()) {
        _pendingBackupRetry = true
        logger.warn('[Settings] Backup failed (offline) — will retry when online')
      }
      throw e
    }
  })
}
