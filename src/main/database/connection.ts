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
  // Delete ALL SQLite-related files for this database
  // so we start completely clean every time
  for (const suffix of ['', '-shm', '-wal', '-journal']) {
    const f = dbPath + suffix
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); logger.warn(`[DB] Deleted: ${f}`) }
      catch (e) { logger.error(`[DB] Could not delete ${f}: ${(e as Error).message}`) }
    }
  }
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
    // If locked or corrupted — wipe and recreate
    logger.warn(`[DB] Open failed (${(err as Error).message}) — wiping and retrying`)
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
