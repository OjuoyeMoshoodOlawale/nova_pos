// src/main/utils/safeHandle.ts
// ─────────────────────────────────────────────────────────
// Wraps ipcMain.handle with:
//  1. Consistent { success, data/error } response envelope
//  2. SQLITE_BUSY retry (up to 3 attempts, exponential back-off)
//  3. Structured error logging
// ─────────────────────────────────────────────────────────

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import logger from './logger'

const MAX_RETRIES = 3

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => any

export function safeHandle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (event, ...args) => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await handler(event, ...args)
        return { success: true, data: data ?? null }
      } catch (err: unknown) {
        const e = err as Error & { code?: string }

        // Retry SQLITE_BUSY errors with exponential back-off
        if (e.code === 'SQLITE_BUSY' && attempt < MAX_RETRIES) {
          const wait = 100 * Math.pow(2, attempt - 1) // 100ms, 200ms
          logger.warn(`[IPC] ${channel} — SQLITE_BUSY, retry ${attempt}/${MAX_RETRIES} in ${wait}ms`)
          await sleep(wait)
          continue
        }

        logger.error(`[IPC] ${channel} error (attempt ${attempt}):`, e.message ?? err)
        return {
          success: false,
          error: e.message ?? 'An unexpected error occurred',
        }
      }
    }

    // Should not reach here, but TypeScript needs it
    return { success: false, error: 'Max retries exceeded' }
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
