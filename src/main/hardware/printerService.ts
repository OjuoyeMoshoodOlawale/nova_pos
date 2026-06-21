// src/main/hardware/printerService.ts
// ─────────────────────────────────────────────────────────
// Builds receipt data and sends it to the configured
// thermal printer via electron-pos-printer.
// ─────────────────────────────────────────────────────────

import { format }              from 'date-fns'
import { getDb }               from '../database/connection'
import { getSaleById }         from '../services/saleService'
import { getBusinessProfile, getSetting } from '../services/settingsService'
import { BusinessProfile, SaleDetail }    from '@shared/types'
import logger                  from '../utils/logger'

// ─── Receipt line helpers ─────────────────────────────────

function t(value: string, bold = false, align: 'left' | 'center' | 'right' = 'left', size = '12px') {
  return { type: 'text' as const, value, style: { fontWeight: bold ? '700' : '400', textAlign: align, fontSize: size } }
}
function divider(char = '─', count = 32) { return t(char.repeat(count), false, 'center', '10px') }

// ─── Build receipt content ────────────────────────────────
// Minimal, tight layout — no duplicate lines, no wasted space.

export function buildReceiptContent(sale: SaleDetail, profile: BusinessProfile): Record<string, unknown>[] {
  const sym  = profile.currency_symbol || '₦'
  const data: Record<string, unknown>[] = []

  // Header
  data.push(t(profile.name, true, 'center', '16px'))
  if (profile.address) data.push(t(profile.address, false, 'center', '10px'))
  if (profile.phone)   data.push(t(profile.phone,   false, 'center', '10px'))
  if (profile.receipt_header) data.push(t(profile.receipt_header, false, 'center', '10px'))
  data.push(divider('═'))

  // Sale info — compact
  data.push(t(`${sale.receipt_no}  ${format(new Date(sale.sale_date), 'dd/MM/yy HH:mm')}`, false, 'left', '10px'))
  data.push(t(`Cashier: ${(sale as any).cashier_name}${(sale as any).customer_name ? '  Customer: ' + (sale as any).customer_name : ''}`, false, 'left', '10px'))
  data.push(divider())

  // Items — one line per item: name qty total (no sub-lines)
  data.push(t('ITEM                QTY   TOTAL', true, 'left', '10px'))
  for (const item of sale.items) {
    const disc = item.discount_pct > 0 ? `(-${item.discount_pct}%)` : ''
    const name = (item.product_name + disc).length > 18
      ? (item.product_name.slice(0, disc ? 14 : 18) + disc)
      : (item.product_name + disc).padEnd(18, ' ')
    const qty  = String(item.quantity).padStart(3, ' ')
    const tot  = `${sym}${item.line_total.toFixed(0)}`.padStart(9, ' ')
    data.push({
      type: 'text' as const,
      value: `${name} ${qty} ${tot}`,
      style: { fontSize: '10px', textAlign: 'left', fontFamily: 'monospace', whiteSpace: 'pre' },
    })
  }
  data.push(divider())

  // Totals — compact
  if (sale.discount_amt > 0) {
    data.push(t(`Discount (${sale.discount_pct}%): -${sym}${sale.discount_amt.toFixed(2)}`, false, 'left', '10px'))
  }
  if (sale.tax_amount > 0) {
    data.push(t(`${profile.tax_name}: ${sym}${sale.tax_amount.toFixed(2)}`, false, 'left', '10px'))
  }
  data.push(t(`TOTAL: ${sym}${sale.total_amount.toFixed(2)}`, true, 'right', '15px'))
  data.push(divider())

  // Payment
  for (const pmt of sale.payments) {
    const method = pmt.method.charAt(0).toUpperCase() + pmt.method.slice(1)
    data.push(t(`Paid (${method}): ${sym}${pmt.amount.toFixed(2)}${pmt.reference ? '  Ref:' + pmt.reference : ''}`, false, 'left', '10px'))
  }
  if (sale.change_given > 0) data.push(t(`Change: ${sym}${sale.change_given.toFixed(2)}`, true, 'left', '12px'))

  // Barcode (compact)
  try {
    data.push({ type: 'barcode', value: sale.receipt_no, height: 25, width: 1.2, displayValue: true, fontsize: 8, style: { textAlign: 'center', marginTop: '4px' } })
  } catch { /* not all printers support barcode */ }

  // Footer — one line, no duplicates
  data.push(divider('═'))
  if (profile.receipt_footer) data.push(t(profile.receipt_footer, false, 'center', '10px'))
  data.push(t('Thank you! · Powered by NovaPOS', false, 'center', '9px'))

  return data
}

// ─── Resolve PosPrinter (CACHED — only resolves once) ─────
// electron-pos-printer can export { PosPrinter } (named) or
// { default: { PosPrinter } } (default-wrapped), depending
// on bundler and version.  We try all shapes.
let _cachedPrinter: { print: (...args: any[]) => Promise<void> } | null = null

async function getPrinter() {
  if (_cachedPrinter) return _cachedPrinter

  const mod = await import('electron-pos-printer')
  const printer =
    (mod as any).PosPrinter           ??
    (mod as any).default?.PosPrinter  ??
    (mod as any).default              ??
    null

  if (!printer || typeof printer.print !== 'function') {
    logger.error('[Printer] electron-pos-printer loaded but PosPrinter.print is not a function. Module:', JSON.stringify(Object.keys(mod)))
    throw new Error('Printer unavailable — PosPrinter.print not found.')
  }
  _cachedPrinter = printer
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
    margin:         '0 0 0 0',
    copies:         1,
    silent:         true,
    timeOutPerLine: 200,           // fast — 200ms per line (was 600)
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
    timeOutPerLine: 200,
    pageSize:       (paperWidth === '58mm' ? '58mm' : '80mm') as any,
  })
}
