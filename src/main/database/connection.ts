// src/main/database/connection.ts
import { Database as NodeSqliteDb } from 'node-sqlite3-wasm'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import logger from '../utils/logger'

export type DB = InstanceType<typeof NodeSqliteDb>

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

let _db: DB | null = null

function openDatabase(dbPath: string): DB {
  // ONLY remove WAL sidecar files — NEVER delete the main .db file.
  // The main file could be a freshly restored backup; deleting it
  // would cause a total data loss loop.
  for (const suffix of ['-shm', '-wal', '-journal']) {
    const f = dbPath + suffix
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f) } catch { /* non-fatal */ }
    }
  }
  // Create a fresh empty database (main file was absent or unreadable)
  return new NodeSqliteDb(dbPath)
}

export function getDb(): DB {
  if (_db) return _db

  const dbPath = path.join(app.getPath('userData'), 'novapos.db')
  logger.info(`[DB] Opening database at: ${dbPath}`)

  try {
    _db = new NodeSqliteDb(dbPath)
    _db.exec('PRAGMA foreign_keys = ON')
    _db.exec('PRAGMA synchronous  = NORMAL')
    _db.exec('PRAGMA cache_size   = -16000')
    _db.exec('PRAGMA temp_store   = MEMORY')
  } catch (err) {
    // Open failed — clear WAL sidecars and try once more.
    // NOTE: we do NOT delete novapos.db here. If the file exists but is
    // unreadable it may be a partially-written restore; deleting it
    // would destroy the user's data. We let the second attempt fail
    // with a clear error so the user can restore from backup.
    logger.warn(`[DB] Open failed (${(err as Error).message}) — clearing WAL files and retrying`)
    try { if (_db) { _db.close(); _db = null } } catch { /* ignore */ }

    _db = openDatabase(dbPath)
    _db.exec('PRAGMA foreign_keys = ON')
    _db.exec('PRAGMA synchronous  = NORMAL')
    _db.exec('PRAGMA cache_size   = -16000')
    _db.exec('PRAGMA temp_store   = MEMORY')
    logger.info('[DB] Database recreated after lock error')
  }

  logger.info('[DB] Database opened (node-sqlite3-wasm)')

  app.on('before-quit', () => {
    if (_db) {
      logger.info('[DB] Closing database')
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
