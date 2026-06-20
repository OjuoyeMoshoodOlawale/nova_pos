// src/main/hardware/printerService.ts
// ─────────────────────────────────────────────────────────
// Builds receipt data and sends it to the configured
// thermal printer via electron-pos-printer.
//
// FIX: Dynamic imports in bundled Electron apps sometimes
// return { default: Module } instead of { PosPrinter }.
// We handle every possible export shape defensively.
// ─────────────────────────────────────────────────────────

import { format }              from 'date-fns'
import { getDb }               from '../database/connection'
import { getSaleById }         from '../services/saleService'
import { getBusinessProfile, getSetting } from '../services/settingsService'
import { BusinessProfile, SaleDetail }    from '@shared/types'
import logger                  from '../utils/logger'

// ─── Receipt line helpers ─────────────────────────────────

function t(value: string, bold = false, align: 'left' | 'center' | 'right' = 'left', size = '13px') {
  return { type: 'text' as const, value, style: { fontWeight: bold ? '700' : '400', textAlign: align, fontSize: size } }
}
function divider(char = '─', count = 32) { return t(char.repeat(count), false, 'center', '11px') }

// ─── Build receipt content ────────────────────────────────

export function buildReceiptContent(sale: SaleDetail, profile: BusinessProfile): Record<string, unknown>[] {
  const sym  = profile.currency_symbol || '₦'
  const data: Record<string, unknown>[] = []  if (profile.receipt_header) data.push(t(profile.receipt_header, false, 'center', '12px'))
  data.push(t(profile.name, true, 'center', '18px'))
  if (profile.address) data.push(t(profile.address, false, 'center', '11px'))
  if (profile.phone)   data.push(t(profile.phone,   false, 'center', '11px'))
  data.push(divider('═'))

  data.push(t(`Receipt:  ${sale.receipt_no}`,                                false, 'left', '12px'))
  data.push(t(`Date:     ${format(new Date(sale.sale_date), 'dd/MM/yyyy HH:mm:ss')}`, false, 'left', '12px'))
  data.push(t(`Cashier:  ${(sale as any).cashier_name}`,                     false, 'left', '12px'))
  if ((sale as any).customer_name) data.push(t(`Customer: ${(sale as any).customer_name}`, false, 'left', '12px'))
  data.push(divider())

  // Items as text rows — table objects don't render on all 80mm drivers.
  data.push(divider())
  data.push(t('ITEM                QTY   TOTAL', true, 'left', '11px'))
  for (const item of sale.items) {
    const name = item.product_name.length > 18
      ? item.product_name.slice(0, 18)
      : item.product_name.padEnd(18, ' ')
    const qty  = String(item.quantity).padStart(3, ' ')
    const tot  = `${sym}${item.line_total.toFixed(2)}`.padStart(9, ' ')
    // monospace alignment via a fixed-width font line
    data.push({
      type: 'text' as const,
      value: `${name} ${qty} ${tot}`,
      style: { fontSize: '11px', textAlign: 'left', fontFamily: 'monospace', whiteSpace: 'pre' },
    })
    // unit price as a small sub-line
    data.push(t(`     @ ${sym}${item.unit_price.toFixed(2)} each`, false, 'left', '10px'))
  }

  for (const item of sale.items) {
    if (item.discount_pct > 0) {
      data.push(t(`  → ${item.product_name}: -${item.discount_pct}% discount`, false, 'left', '10px'))
    }
  }
  data.push(divider())

  const rows: [string, string][] = [[`Subtotal:`, `${sym}${sale.subtotal.toFixed(2)}`]]
  if (sale.discount_amt > 0) rows.push([`Discount (${sale.discount_pct}%):`, `-${sym}${sale.discount_amt.toFixed(2)}`])
  if (sale.tax_amount   > 0) rows.push([`${profile.tax_name}:`, `${sym}${sale.tax_amount.toFixed(2)}`])

  // Totals as text rows (label left, amount right via padding)
  for (const [k, v] of rows) {
    data.push({
      type: 'text' as const,
      value: `${k.padEnd(20, ' ')}${v.padStart(12, ' ')}`,
      style: { fontSize: '12px', textAlign: 'left', fontFamily: 'monospace', whiteSpace: 'pre' },
    })
  }
  data.push(t(`TOTAL: ${sym}${sale.total_amount.toFixed(2)}`, true, 'right', '17px'))
  data.push(divider())

  for (const pmt of sale.payments) {
    const method = pmt.method.charAt(0).toUpperCase() + pmt.method.slice(1)
    data.push(t(`Paid (${method}): ${sym}${pmt.amount.toFixed(2)}`, false, 'left', '12px'))
    if (pmt.reference) data.push(t(`  Ref: ${pmt.reference}`, false, 'left', '10px'))
  }
  if (sale.change_given > 0) data.push(t(`Change: ${sym}${sale.change_given.toFixed(2)}`, true, 'left', '13px'))

  try {
    data.push({ type: 'barcode', value: sale.receipt_no, height: 30, width: 1.5, displayValue: true, fontsize: 9, style: { textAlign: 'center', marginTop: '8px' } })
  } catch { /* not all printers support barcode */ }

  data.push(divider('═'))
  if (profile.receipt_footer) data.push(t(profile.receipt_footer, false, 'center', '12px'))
  data.push(t('Thank you for your patronage!', false, 'center', '12px'))
  data.push(t('Powered by Webautomate Nigeria', false, 'center', '10px'))
  // Trailing feed — thermal cutters slice ~2-3 lines below the last print,
  // so push blank lines to ensure the footer clears the blade.
  // ──────────────────────────────────────────────────────
  // Footer spacing (1 blank line)
  data.push(t(' ', false, 'center', '10px'))

  return data
}

// ─── Resolve PosPrinter across import shapes ──────────────
// electron-pos-printer can export { PosPrinter } (named) or
// { default: { PosPrinter } } (default-wrapped), depending
// on bundler and version.  We try all shapes.
async function getPrinter(): Promise<{ print: (...args: any[]) => Promise<void> }> {
  const mod = await import('electron-pos-printer')
  const printer =
    (mod as any).PosPrinter           ??   // named export (most versions)
    (mod as any).default?.PosPrinter  ??   // default-wrapped named export
    (mod as any).default              ??   // plain default export
    null

  if (!printer || typeof printer.print !== 'function') {
    logger.error('[Printer] electron-pos-printer loaded but PosPrinter.print is not a function. Module:', JSON.stringify(Object.keys(mod)))
    throw new Error('Printer unavailable — PosPrinter.print not found. Check electron-pos-printer is installed (npm install electron-pos-printer).')
  }
  return printer
}

// ─── Print a sale by ID ───────────────────────────────────

export async function printSaleById(saleId: number): Promise<void> {
  const db = getDb()
  const sale = getSaleById(db, saleId)
  if (!sale) throw new Error(`Sale #${saleId} not found`)

  const profile = getBusinessProfile(db)
  if (!profile) throw new Error('Business profile not configured')

  const printerName = getSetting(db, 'printer_name')
  const paperWidth  = (getSetting(db, 'paper_width') || '80mm') as string

  if (!printerName) {
    logger.warn('[Printer] No printer configured — skipping print')
    return
  }

  const PosPrinter = await getPrinter()
  const content    = buildReceiptContent(sale, profile)

  await PosPrinter.print(content as any, {
    printerName,
    preview:        false,
    margin:         '0 0 0 0',     // start at the very top, no side gaps
    copies:         1,
    silent:         true,
    timeOutPerLine: 600,
    pageSize:       (paperWidth === '58mm' ? '58mm' : '80mm') as any,
  })

  logger.info(`[Printer] Receipt printed: ${sale.receipt_no} → ${printerName}`)
}

// ─── Print raw content (test prints, pre-formatted) ───────

export async function printRaw(content: unknown[]): Promise<void> {
  const db = getDb()
  const printerName = getSetting(db, 'printer_name')
  const paperWidth  = getSetting(db, 'paper_width') || '80mm'

  if (!printerName) throw new Error('No printer configured. Go to Settings → Printer.')

  const PosPrinter = await getPrinter()
  await PosPrinter.print(content as any, {
    printerName,
    preview:        false,
    margin:         '0 0 0 0',
    copies:         1,
    silent:         true,
    timeOutPerLine: 400,
    pageSize:       (paperWidth === '58mm' ? '58mm' : '80mm') as any,
  })
}
