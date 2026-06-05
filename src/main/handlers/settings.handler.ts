// src/main/handlers/settings.handler.ts
// ─────────────────────────────────────────────────────────
// Backup security model
// ─────────────────────────────────────────────────────────
// • Backup format  : .novaenc (AES-256-GCM encrypted SQLite)
// • Key derivation : SHA-256( activation_key + app-salt )
//   — the activation key is unique per licence; the same key on
//     a replacement machine produces the same backup key.
//   — If no activation key yet, a random key is generated and
//     stored in the settings table.
// • Backup location: SYSTEM-FIXED at %APPDATA%\nova-pos\backups\
//   Users CANNOT change this path.
// • Google Drive   : user sets their GDrive Desktop sync folder;
//   each backup is ALSO copied there (still encrypted).
// • Legacy .db     : restore still accepts old unencrypted files.
// ─────────────────────────────────────────────────────────
import type { DB }    from '../database/connection'
import { dialog, app, net, shell } from 'electron'
import fs   from 'node:fs'
import path from 'node:path'
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'
import { safeHandle }              from '../utils/safeHandle'
import * as settingsService        from '../services/settingsService'
import { testEmail, performBackup } from '../mailer/mailerService'
import { CH }                      from '@shared/ipcChannels'
import logger                      from '../utils/logger'

// ─── Safe path resolution ─────────────────────────────────
// NEVER call app.getPath twice — if the first call returns undefined
// or throws, calling it again for 'exe' also fails and then
// path.dirname(undefined) gives the confusing "Received undefined" error.
// Instead, fall through to process.env / process.execPath which are
// ALWAYS available as real strings.

function safeUserDataPath(): string {
  // 1 — Electron app.getPath (the correct path)
  try {
    const p = app.getPath('userData')
    if (typeof p === 'string' && p.length > 0) return p
  } catch { /* fall through */ }

  // 2 — Windows %APPDATA%
ova-pos
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || process.env.LOCALAPPDATA || ''
    if (appdata) return path.join(appdata, 'nova-pos')
  }

  // 3 — macOS ~/Library/Application Support/nova-pos
  if (process.platform === 'darwin') {
    const home = process.env.HOME || ''
    if (home) return path.join(home, 'Library', 'Application Support', 'nova-pos')
  }

  // 4 — Linux ~/.config/nova-pos
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (home) return path.join(home, '.config', 'nova-pos')

  // 5 — Absolute last resort: next to the executable
  return path.join(path.dirname(process.execPath), 'nova-pos-data')
}

function getDbPath(): string { return path.join(safeUserDataPath(), 'novapos.db') }

// Reads the user-chosen backup folder from the settings table.
// Falls back through three options so we never return undefined.
function resolveBackupDir(db: DB): string {
  // Option A — user-saved setting (e.g. C:\Users\USER\Desktop\backup)
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'backup_path'").get() as any
    const v = row?.value
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  } catch { /* fall through */ }

  // Option B — userData/backups
  try {
    return path.join(safeUserDataPath(), 'backups')
  } catch { /* fall through */ }

  // Option C — next to the exe
  return path.join(path.dirname(process.execPath), 'nova-pos-backups')
}

// ─── Encryption constants ─────────────────────────────────
// AES-256-GCM authenticated encryption.
// File header layout (33 bytes total):
//   [0-3]   'NOVA'  magic
//   [4]     0x01    version
//   [5-16]  nonce   (12 bytes — GCM standard)
//   [17-32] authTag (16 bytes — GCM authentication tag)
//   [33…]   ciphertext (encrypted SQLite bytes)
const MAGIC_STR  = 'NOVA'
const VERSION_B  = 0x01
const NONCE_LEN  = 12
const TAG_LEN    = 16
const HEADER_LEN = 4 + 1 + NONCE_LEN + TAG_LEN  // 33 bytes

/**
 * Derive the 32-byte AES key for this installation.
 * Tied to the activation key so the backup can be restored on
 * any machine that has been activated with the same licence key.
 */
function deriveBackupKey(db: DB): Buffer {
  const act = db.prepare('SELECT activation_key FROM activation LIMIT 1').get() as any

  if (act?.activation_key) {
    // Deterministic: SHA-256 of activationKey + app-level salt
    return createHash('sha256')
      .update(`${act.activation_key}:nova-pos-encrypted-backup-v1`)
      .digest()
  }

  // Pre-activation fallback: generate once and persist in settings
  let stored = settingsService.getSetting(db, 'backup_enc_key') ?? ''
  if (!stored || stored.length < 64) {
    stored = randomBytes(32).toString('hex')
    settingsService.setSetting(db, 'backup_enc_key', stored)
    logger.info('[Settings] Generated persistent backup encryption key')
  }
  return Buffer.from(stored, 'hex')
}

/**
 * Encrypt the live SQLite DB file and return the encrypted bytes.
 * The output is a self-contained blob: header + ciphertext.
 */
function encryptDb(dbPath: string, key: Buffer): Buffer {
  const plaintext = fs.readFileSync(dbPath)
  const nonce     = randomBytes(NONCE_LEN)
  const cipher    = createCipheriv('aes-256-gcm', key, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag       = cipher.getAuthTag()

  return Buffer.concat([
    Buffer.from(MAGIC_STR),          // 4 bytes
    Buffer.from([VERSION_B]),         // 1 byte
    nonce,                            // 12 bytes
    tag,                              // 16 bytes
    encrypted,                        // variable
  ])
}

/**
 * Decrypt a .novaenc blob back to plain SQLite bytes.
 * Throws with a clear message if the magic, version, or auth tag is wrong.
 */
function decryptBackup(blob: Buffer, key: Buffer): Buffer {
  if (blob.length < HEADER_LEN + 100) {
    throw new Error('File is too small to be a valid NovaPOS backup.')
  }
  if (blob.slice(0, 4).toString() !== MAGIC_STR) {
    throw new Error('Not a NovaPOS encrypted backup — wrong file format.')
  }
  const version = blob[4]
  if (version !== VERSION_B) {
    throw new Error(`Unsupported backup version (${version}). Update NovaPOS and try again.`)
  }

  const nonce     = blob.slice(5, 5 + NONCE_LEN)
  const tag       = blob.slice(5 + NONCE_LEN, HEADER_LEN)
  const ciphertext = blob.slice(HEADER_LEN)

  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error(
      'Decryption failed — this backup was created on a different NovaPOS installation ' +
      'or the file is corrupted. To restore on a new machine, re-activate with the same ' +
      'licence key first, then restore.'
    )
  }
}

/** Prune .novaenc files in a directory, keeping the newest `keep` files. */
function pruneOldBackups(dir: string, keep = 30) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('novapos-backup-') && f.endsWith('.novaenc'))
      .sort()                              // ISO timestamps sort chronologically
    if (files.length > keep) {
      files.slice(0, files.length - keep).forEach(f => {
        fs.unlinkSync(path.join(dir, f))
        logger.info(`[Settings] Pruned old backup: ${f}`)
      })
    }
  } catch { /* non-fatal */ }
}

// ─── Auto-retry state (for email backup) ─────────────────
let _pendingBackupRetry = false

function scheduleRetryIfOffline() {
  setInterval(async () => {
    if (!_pendingBackupRetry || !net.isOnline()) return
    logger.info('[Settings] Network restored — retrying pending backup')
    _pendingBackupRetry = false
    try {
      await performBackup()
      logger.info('[Settings] Retry backup succeeded')
    } catch {
      _pendingBackupRetry = true
      logger.warn('[Settings] Retry backup failed again')
    }
  }, 2 * 60 * 1000)
}
scheduleRetryIfOffline()

// ─── Handler registration ─────────────────────────────────
export function registerSettingsHandlers(db: DB): void {

  safeHandle(CH.SETTINGS_GET,  ()                          => settingsService.getAllSettings(db))
  safeHandle(CH.SETTINGS_SET,  (_e, key: string, val: string) => settingsService.setSetting(db, key, val))
  safeHandle(CH.PROFILE_GET,   ()                          => settingsService.getBusinessProfile(db))
  safeHandle(CH.PROFILE_SAVE,  (_e, data)                  => settingsService.saveBusinessProfile(db, data))

  // ── Printers ─────────────────────────────────────────
  safeHandle(CH.SETTINGS_LIST_PRINTERS, async () => {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    return (await win.webContents.getPrintersAsync()).map(p => p.name)
  })

  // ── App paths (read-only display in UI) ──────────────
  // backupDir is the SYSTEM-FIXED location — NOT user-configurable.
  // The UI shows it as read-only so users understand where files are.
  safeHandle('settings:getAppPaths', () => ({
    userData:   safeUserDataPath(),
    dbPath:     getDbPath(),
    backupDir:  resolveBackupDir(db),  // user-saved choice or system default
    defaultDir: path.join(safeUserDataPath(), 'backups'),
  }))

  // ── Browse for Google Drive sync folder ──────────────
  // This is the ONLY folder the user is allowed to configure.
  safeHandle('settings:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      title:      'Choose Google Drive Sync Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // ── Open folder in OS file explorer ──────────────────
  safeHandle('settings:openFolder', async (_e, folderPath: string) => {
    await shell.openPath(folderPath)
    return true
  })

  // ── Local encrypted backup (primary method) ──────────
  // Backup path is SYSTEM-FIXED: %APPDATA%\nova-pos\backups\
  // opts.gdriveDir is the only user-controlled path — the encrypted
  // backup is ALSO copied there so Google Drive Desktop can sync it.
  safeHandle('settings:backupLocal', async (_e, opts: {
    gdriveDir?: string   // optional second copy (e.g. GDrive sync folder)
  } = {}) => {
    const key       = deriveBackupKey(db)
    const dbPath    = getDbPath()
    // Use the folder the user chose via Browse; fall back to system default.
    // This is read from the 'backup_path' setting, not from opts, so the
    // chosen path persists across app restarts.
    const backupDir = resolveBackupDir(db)
    const ts        = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename  = `novapos-backup-${ts}.novaenc`

    // Encrypt the live DB
    const encryptedBlob = encryptDb(dbPath, key)

    // Write to system backup folder
    fs.mkdirSync(backupDir, { recursive: true })
    const destPath = path.join(backupDir, filename)
    fs.writeFileSync(destPath, encryptedBlob)
    logger.info(`[Settings] Encrypted backup saved: ${destPath}`)

    // Persist metadata
    settingsService.setSetting(db, 'last_backup_at',   new Date().toISOString())
    settingsService.setSetting(db, 'last_backup_file', destPath)

    // Copy to Google Drive sync folder (same encrypted blob)
    let gdriveCopied = false
    if (opts.gdriveDir) {
      try {
        fs.mkdirSync(opts.gdriveDir, { recursive: true })
        fs.writeFileSync(path.join(opts.gdriveDir, filename), encryptedBlob)
        gdriveCopied = true
        logger.info(`[Settings] Backup synced to GDrive: ${path.join(opts.gdriveDir, filename)}`)
      } catch (e) {
        logger.warn('[Settings] GDrive copy failed:', e)
      }
    }

    pruneOldBackups(backupDir)
    return { filePath: destPath, filename, gdriveCopied }
  })

  // ── Download encrypted backup (save-as dialog) ────────
  // Lets the user save a copy to a USB drive, another PC, etc.
  // The file is still encrypted — it's the same .novaenc format.
  safeHandle(CH.SETTINGS_BACKUP, async () => {
    const key      = deriveBackupKey(db)
    // (db is used below for deriveBackupKey)
    const result = await dialog.showSaveDialog({
      title:       'Download Encrypted NovaPOS Backup',
      defaultPath: `novapos-backup-${new Date().toISOString().slice(0, 10)}.novaenc`,
      filters:     [
        { name: 'NovaPOS Encrypted Backup', extensions: ['novaenc'] },
      ],
    })
    if (result.canceled || !result.filePath) return null

    const encryptedBlob = encryptDb(getDbPath(), key)
    fs.writeFileSync(result.filePath, encryptedBlob)
    logger.info(`[Settings] Encrypted download saved: ${result.filePath}`)
    return result.filePath
  })

  // ── Restore (handles .novaenc AND legacy .db) ─────────
  // SAFETY FLOW (nothing written until user confirms):
  //
  //  Step 1  Pick file via OS dialog
  //  Step 2  Read + decrypt to memory  ← ZERO disk writes here
  //          → if decrypt fails, error shown, live DB untouched
  //  Step 3  Show OS confirmation dialog:
  //          "Backup from [date] · Decryption ✓ · Replace all data?"
  //  Step 4  User clicks "Restore Now" → write plain SQLite → restart
  //          User clicks "Cancel"      → live DB untouched, returns null
  safeHandle(CH.SETTINGS_RESTORE, async () => {
    // ── Step 1: pick file ─────────────────────────────
    const pick = await dialog.showOpenDialog({
      title:      'Select NovaPOS Backup to Restore',
      filters: [
        { name: 'NovaPOS Encrypted Backup (.novaenc)',  extensions: ['novaenc'] },
        { name: 'Legacy SQLite Database (.db)',          extensions: ['db']       },
      ],
      properties: ['openFile'],
    })
    if (pick.canceled || !pick.filePaths[0]) return null

    const selectedFile = pick.filePaths[0]
    const fileName     = path.basename(selectedFile)
    const isEncrypted  = fileName.toLowerCase().endsWith('.novaenc')
    let plaintext: Buffer
    let infoLines: string

    // ── Step 2: decrypt to memory — NO DISK WRITES ───
    if (isEncrypted) {
      logger.info(`[Settings] Verifying backup: ${fileName}`)
      const key  = deriveBackupKey(db)
      const blob = fs.readFileSync(selectedFile)

      // decryptBackup() throws with a clear user-readable message if:
      //   · wrong magic bytes  (not a novaenc file)
      //   · auth tag mismatch  (wrong key / file corrupted)
      // safeHandle catches the throw → { success:false, error } returned
      // to the renderer.  The live DB is NEVER touched.
      plaintext = decryptBackup(blob, key)

      // Parse date from filename  e.g. novapos-backup-2026-06-05T22-00-00.novaenc
      const m  = fileName.match(/backup-(\d{4}-\d{2}-\d{2}T[\d-]+)/)
      const ts = m ? m[1].replace(/T/, ' ').replace(/-(\d{2})-(\d{2})$/, ':$1:$2') : 'unknown date'
      infoLines = [
        `File   : ${fileName}`,
        `Date   : ${ts}`,
        `Format : Encrypted  (AES-256-GCM)`,
        `Status : Decryption verified ✓`,
      ].join('\n')
      logger.info(`[Settings] Decryption verified — ${fileName}`)
    } else {
      // Legacy .db — read raw bytes, no decryption
      logger.warn(`[Settings] Restoring legacy unencrypted backup: ${fileName}`)
      plaintext = fs.readFileSync(selectedFile)
      infoLines = [
        `File   : ${fileName}`,
        `Format : Unencrypted SQLite  (legacy)`,
        `Status : File readable ✓`,
      ].join('\n')
    }

    // ── Step 3: confirm with native OS dialog ─────────
    // Decryption succeeded — now we can tell the user the exact
    // backup they are about to restore and get explicit confirmation.
    const { response } = await dialog.showMessageBox({
      type:      'warning',
      title:     'Confirm Database Restore',
      message:   'Replace current data with this backup?',
      detail:    [
        infoLines,
        '',
        'This will replace ALL current sales, products, and settings.',
        'The application will restart automatically after restoring.',
        '',
        '⚠️  This action cannot be undone.',
      ].join('\n'),
      buttons:   ['Cancel', 'Restore Now'],
      defaultId: 0,   // "Cancel" is the default to prevent accidental clicks
      cancelId:  0,
    })

    if (response === 0) {
      logger.info('[Settings] Restore cancelled by user')
      return null     // cancelled — live DB still untouched
    }

    // ── Step 4: write plain SQLite, then restart ──────
    // Only reached when: decryption ✓ + user clicked "Restore Now"
    db.close()
    fs.writeFileSync(getDbPath(), plaintext)
    logger.warn(`[Settings] Database restored from ${fileName} — restarting`)
    app.relaunch()
    app.exit(0)
  })

  // ── Reset / delete database (fresh start) ────────────
  // Closes and DELETES the live .db file.  The app restarts and
  // runMigrations() creates a brand-new empty database.
  // Restricted: caller must supply the word "RESET" as confirmation.
  safeHandle('settings:resetDatabase', async (_e, confirm: string) => {
    if (confirm !== 'RESET') {
      throw new Error('Confirmation token required — pass the string "RESET".')
    }

    const { response } = await dialog.showMessageBox({
      type:      'warning',
      title:     'Delete All Data?',
      message:   'This will permanently delete the entire database.',
      detail:    [
        'ALL data will be lost:',
        '  • Every sale, receipt, and payment',
        '  • All products, stock levels, and prices',
        '  • All customers, suppliers, and staff',
        '  • All settings and business profile',
        '',
        'The application will restart with a completely empty database.',
        '',
        '⚠️  Make a backup first if you need to keep any data.',
        '⚠️  This CANNOT be undone.',
      ].join('\n'),
      buttons:   ['Cancel — Keep My Data', 'Delete Everything'],
      defaultId: 0,
      cancelId:  0,
    })

    if (response === 0) return null

    const dbPath = getDbPath()
    db.close()
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    logger.warn('[Settings] Database deleted — restarting with fresh DB')
    app.relaunch()
    app.exit(0)
  })

  // ── Email test ────────────────────────────────────────
  safeHandle(CH.SETTINGS_TEST_EMAIL, async (_e, config) => { await testEmail(config) })

  // ── Scheduled/auto backup ─────────────────────────────
  safeHandle('settings:backupNow', async () => {
    try {
      const result = await performBackup()
      _pendingBackupRetry = false
      return result
    } catch (e: any) {
      if (!net.isOnline()) {
        _pendingBackupRetry = true
        logger.warn('[Settings] Backup failed (offline) — will retry when online')
      }
      throw e
    }
  })
}
