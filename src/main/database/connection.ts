// src/main/database/connection.ts
// Pure WASM SQLite — no native compilation, works on any OS without build tools
import { Database as NodeSqliteDb } from 'node-sqlite3-wasm'
import { app } from 'electron'
import path from 'node:path'
import logger from '../utils/logger'

// ─── Portable DB type ─────────────────────────────────────
// Import this type in all services instead of importing from better-sqlite3
export type DB = InstanceType<typeof NodeSqliteDb>

// ─── WASM transaction helper ─────────────────────────────
// node-sqlite3-wasm has no db.transaction() — use BEGIN/COMMIT/ROLLBACK
export function withTx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try { db.exec('ROLLBACK') } catch { /* ignore rollback errors */ }
    throw err
  }
}

// ─── Singleton connection ─────────────────────────────────
let _db: DB | null = null

export function getDb(): DB {
  if (_db) return _db

  const dbDir  = app.getPath('userData')
  const dbPath = path.join(dbDir, 'novapos.db')

  logger.info(`[DB] Opening database at: ${dbPath}`)

  _db = new NodeSqliteDb(dbPath)

  // Pragmas via exec (WASM uses exec() not .pragma())
  _db.exec('PRAGMA journal_mode = WAL')
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
