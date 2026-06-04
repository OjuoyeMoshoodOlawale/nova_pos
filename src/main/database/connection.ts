// src/main/database/connection.ts
// Pure WASM SQLite — no native compilation, works on any OS without build tools.
// NOTE: No WAL mode — node-sqlite3-wasm on Windows does not reliably support it
// and a single-user desktop app does not need concurrent write access.
import { Database as NodeSqliteDb } from 'node-sqlite3-wasm'
import { app } from 'electron'
import path from 'node:path'
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

  const dbPath = path.join(app.getPath('userData'), 'novapos.db')
  logger.info(`[DB] Opening database at: ${dbPath}`)

  _db = new NodeSqliteDb(dbPath)

  // Keep it simple — no WAL mode for node-sqlite3-wasm on Windows
  _db.exec('PRAGMA foreign_keys = ON')
  _db.exec('PRAGMA synchronous  = NORMAL')
  _db.exec('PRAGMA cache_size   = -16000')
  _db.exec('PRAGMA temp_store   = MEMORY')

  logger.info('[DB] Database opened (node-sqlite3-wasm)')

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
