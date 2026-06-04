// src/main/handlers/hardware.handler.ts
import type { DB } from '../database/connection'
import { BrowserWindow } from 'electron'
import { safeHandle }      from '../utils/safeHandle'
import { getSetting }      from '../services/settingsService'
import { printSaleById, printRaw } from '../hardware/printerService'
import { CH }              from '@shared/ipcChannels'
import logger              from '../utils/logger'

export function registerHardwareHandlers(db: DB): void {

  // ── List printers ──────────────────────────────────────
  safeHandle(CH.HARDWARE_PRINTERS, async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => p.name)
  })

  // ── Print receipt by sale ID (renderer sends saleId) ──
  // Called by: window.api.hardware.print({ saleId: N })
  safeHandle(CH.HARDWARE_PRINT, async (_e, data: { saleId?: number } | unknown[]) => {
    if (data && typeof data === 'object' && !Array.isArray(data) && 'saleId' in (data as any)) {
      // Receipt by ID – fetch and build from DB
      await printSaleById((data as { saleId: number }).saleId)
    } else if (Array.isArray(data)) {
      // Pre-formatted content array (legacy / test)
      await printRaw(data)
    } else {
      logger.warn('[Hardware] Unrecognised print payload')
    }
  })

  // ── Test print ────────────────────────────────────────
  safeHandle(CH.HARDWARE_TEST_PRINT, async () => {
    await printRaw([
      { type: 'text', value: '─'.repeat(32),       style: { textAlign: 'center', fontSize: '11px' } },
      { type: 'text', value: 'NovaPOS TEST PRINT',  style: { fontWeight: '700', textAlign: 'center', fontSize: '16px' } },
      { type: 'text', value: new Date().toLocaleString(), style: { textAlign: 'center', fontSize: '12px' } },
      { type: 'text', value: '✓ Printer OK',         style: { fontWeight: '700', textAlign: 'center', fontSize: '14px' } },
      { type: 'text', value: '─'.repeat(32),         style: { textAlign: 'center', fontSize: '11px' } },
    ])
  })
}
