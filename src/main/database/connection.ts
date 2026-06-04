// src/main/database/connection.ts
// Pure WASM SQLite — no native compilation, works on any OS without build tools
import { Database as NodeSqliteDb } from 'node-sqlite3-wasm'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import logger from '../utils/logger'

export type DB = InstanceType<typeof NodeSqliteDb>

// ─── Transaction helper ───────────────────────────────────
export function withTx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw err
  }
}

// ─── Singleton connection ─────────────────────────────────
let _db: DB | null = null

export function getDb(): DB {
  if (_db) return _db

  const dbDir  = app.getPath('userData')
  const dbPath = path.join(dbDir, 'novapos.db')

  // ── Clean up stale WAL lock files from a crashed previous instance ──
  // node-sqlite3-wasm leaves .db-shm / .db-wal behind on hard kills.
  // If the app was not shut down cleanly, delete them so the new instance
  // can open the database without hitting "database is locked".
  for (const ext of ['-shm', '-wal']) {
    const lockFile = dbPath + ext
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile)
        logger.warn(`[DB] Removed stale lock file: ${lockFile}`)
      } catch {
        // If we still can't delete it, another Electron instance is truly running
        logger.error(`[DB] Cannot remove ${lockFile} — another instance may be running`)
      }
    }
  }

  logger.info(`[DB] Opening database at: ${dbPath}`)

  _db = new NodeSqliteDb(dbPath)

  _db.exec('PRAGMA journal_mode    = WAL')
  _db.exec('PRAGMA busy_timeout    = 5000')
  _db.exec('PRAGMA foreign_keys    = ON')
  _db.exec('PRAGMA synchronous     = NORMAL')
  _db.exec('PRAGMA cache_size      = -16000')
  _db.exec('PRAGMA temp_store      = MEMORY')
  _db.exec('PRAGMA wal_autocheckpoint = 1000')

  logger.info('[DB] Database opened (node-sqlite3-wasm, WAL mode)')

  app.on('before-quit', () => {
    if (_db) {
      logger.info('[DB] Closing database connection')
      _db.close()
      _db = null
    }
  })

  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
    logger.info('[DB] Database closed manually')
  }
}
