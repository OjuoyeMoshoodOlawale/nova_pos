// src/main/services/syncService.ts
// ─── Supabase Cloud Sync Engine ─────────────────────────
// Pushes rows where is_sync=0 to the customer's Supabase project,
// then marks them is_sync=1. Runs on a configurable interval
// AND whenever the PC comes online (navigator.onLine).
//
// Architecture:
//   Local SQLite  ──(push dirty rows)──▶  Supabase (Postgres)
//   Mobile app    ◀──(pull unsynced)────  Supabase (Postgres)
//
// The mobile app pulls from Supabase using mobile_synced=false,
// then sets mobile_synced=true after downloading.

import logger from '../utils/logger'
import type { DB } from '../database/connection'

// ─── Tables to sync (order matters: parents before children) ──
const SYNC_TABLES = [
  'categories',
  'suppliers',
  'products',
  'customers',
  'sales',
  'sale_items',
  'payments',
  'stock_adjustments',
  'purchase_orders',
  'purchase_order_items',
  'activity_log',
] as const

interface SupabaseConfig {
  supabase_url: string
  supabase_key: string
  sync_interval: number
  is_enabled: number
  last_sync_at: string | null
}

let syncTimer: ReturnType<typeof setInterval> | null = null

// ─── Get config from local DB ───────────────────────────
function getConfig(db: DB): SupabaseConfig | null {
  try {
    const row = db.prepare('SELECT * FROM supabase_config WHERE id = 1').get() as SupabaseConfig | undefined
    if (!row || !row.supabase_url || !row.supabase_key || !row.is_enabled) return null
    return row
  } catch {
    return null
  }
}

// ─── Push dirty rows for one table ──────────────────────
async function pushTable(
  db: DB,
  table: string,
  url: string,
  key: string
): Promise<number> {
  // Fetch all unsynced rows
  let rows: Record<string, unknown>[]
  try {
    rows = db.prepare(`SELECT * FROM ${table} WHERE is_sync = 0 LIMIT 200`).all() as Record<string, unknown>[]
  } catch {
    return 0 // table may not have is_sync yet
  }
  if (rows.length === 0) return 0

  // Strip is_sync from the payload (Supabase doesn't need it)
  const payload = rows.map(r => {
    const { is_sync, ...rest } = r
    return { ...rest, mobile_synced: false }
  })

  // Upsert to Supabase via REST API (PostgREST)
  // Uses ON CONFLICT (id) DO UPDATE to handle both inserts and updates
  const resp = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText)
    logger.warn(`[Sync] ${table}: push failed (${resp.status}): ${err}`)
    return 0
  }

  // Mark rows as synced in local DB
  const ids = rows.map(r => r.id)
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE ${table} SET is_sync = 1 WHERE id IN (${placeholders})`).run(ids)

  return rows.length
}

// ─── Full sync cycle ────────────────────────────────────
export async function runSync(db: DB): Promise<{ total: number; errors: string[] }> {
  const cfg = getConfig(db)
  if (!cfg) return { total: 0, errors: ['Sync not configured or disabled'] }

  let total = 0
  const errors: string[] = []

  for (const table of SYNC_TABLES) {
    try {
      const count = await pushTable(db, table, cfg.supabase_url, cfg.supabase_key)
      total += count
      if (count > 0) logger.info(`[Sync] ${table}: pushed ${count} rows`)
    } catch (err) {
      const msg = `${table}: ${(err as Error).message}`
      errors.push(msg)
      logger.error(`[Sync] ${msg}`)
    }
  }

  // Update last_sync_at
  try {
    db.prepare("UPDATE supabase_config SET last_sync_at = datetime('now'), updated_at = datetime('now') WHERE id = 1").run()
  } catch { /* non-fatal */ }

  if (total > 0) logger.info(`[Sync] Cycle complete: ${total} rows pushed`)
  return { total, errors }
}

// ─── Start the sync interval ────────────────────────────
export function startSyncInterval(db: DB): void {
  stopSyncInterval()
  const cfg = getConfig(db)
  if (!cfg) {
    logger.info('[Sync] Not configured — skipping interval start')
    return
  }

  const ms = (cfg.sync_interval || 300) * 1000  // default 5 min
  logger.info(`[Sync] Starting interval: every ${cfg.sync_interval}s`)

  // Run immediately on start, then on interval
  runSync(db).catch(e => logger.error(`[Sync] Initial run failed: ${e}`))

  syncTimer = setInterval(() => {
    runSync(db).catch(e => logger.error(`[Sync] Interval run failed: ${e}`))
  }, ms)
}

export function stopSyncInterval(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}

// ─── Trigger sync when PC comes online ──────────────────
export function setupOnlineSync(db: DB): void {
  // In Electron main process, we check connectivity periodically
  // rather than using navigator.onLine (which is renderer-only)
  let wasOffline = false
  setInterval(async () => {
    try {
      const cfg = getConfig(db)
      if (!cfg) return
      // Quick connectivity check against the Supabase URL
      const resp = await fetch(`${cfg.supabase_url}/rest/v1/`, {
        method: 'HEAD',
        headers: { 'apikey': cfg.supabase_key },
        signal: AbortSignal.timeout(5000),
      })
      if (resp.ok && wasOffline) {
        logger.info('[Sync] Back online — running sync')
        await runSync(db)
      }
      wasOffline = false
    } catch {
      wasOffline = true
    }
  }, 30_000) // check every 30s
}
