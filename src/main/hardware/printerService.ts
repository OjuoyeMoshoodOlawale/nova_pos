// src/main/hardware/printerService.ts
// ─────────────────────────────────────────────────────────
// Builds receipt data for electron-pos-printer and sends
// it to the configured thermal printer.
// ─────────────────────────────────────────────────────────

import { format } from 'date-fns'
import { getDb }                from '../database/connection'
import { getSaleById }          from '../services/saleService'
import { getBusinessProfile }   from '../services/settingsService'
import { getSetting }           from '../services/settingsService'
import { BusinessProfile, SaleDetail } from '@shared/types'
import logger                   from '../utils/logger'

// ─── RECEIPT LINES BUILDER ────────────────────────────────

function t(value: string, bold = false, align: 'left'|'center'|'right' = 'left', size = '13px') {
  return {
    type: 'text' as const,
    value,
    style: {
      fontWeight: bold ? '700' : '400',
      textAlign: align,
      fontSize: size,
    },
  }
}

function divider(char = '─', count = 32) {
  return t(char.repeat(count), false, 'center', '11px')
}

export function buildReceiptContent(
  sale: SaleDetail,
  profile: BusinessProfile
): Record<string, unknown>[] {
  const sym  = profile.currency_symbol || '₦'
  const data: Record<string, unknown>[] = []

  // ── Header ──────────────────────────────────────────────
  if (profile.receipt_header) {
    data.push(t(profile.receipt_header, false, 'center', '12px'))
  }
  data.push(t(profile.name, true, 'center', '18px'))
  if (profile.address) data.push(t(profile.address, false, 'center', '11px'))
  if (profile.phone)   data.push(t(profile.phone,   false, 'center', '11px'))

  data.push(divider('═'))

  // ── Sale info ────────────────────────────────────────────
  data.push(t(`Receipt:  ${sale.receipt_no}`, false, 'left', '12px'))
  data.push(t(`Date:     ${format(new Date(sale.sale_date), 'dd/MM/yyyy HH:mm:ss')}`, false, 'left', '12px'))
  data.push(t(`Cashier:  ${sale.cashier_name}`, false, 'left', '12px'))
  if (sale.customer_name) {
    data.push(t(`Customer: ${sale.customer_name}`, false, 'left', '12px'))
  }

  data.push(divider())

  // ── Items ────────────────────────────────────────────────
  data.push({
    type: 'table',
    tableHeader: ['ITEM', 'QTY', 'PRICE', 'TOTAL'],
    tableBody: sale.items.map(item => [
      item.product_name.slice(0, 20),
      String(item.quantity),
      `${sym}${item.unit_price.toFixed(2)}`,
      `${sym}${item.line_total.toFixed(2)}`,
    ]),
    tableHeaderStyle: 'border: none; font-size: 11px; font-weight: bold;',
    tableBodyStyle:   'border: none; font-size: 11px;',
    style: 'width: 100%;',
  })

  // ── Per-item discounts (if any) ──────────────────────────
  for (const item of sale.items) {
    if (item.discount_pct > 0) {
      data.push(t(`  → ${item.product_name}: -${item.discount_pct}% discount`, false, 'left', '10px'))
    }
  }

  data.push(divider())

  // ── Totals ───────────────────────────────────────────────
  const rows: [string, string][] = [
    ['Subtotal:', `${sym}${sale.subtotal.toFixed(2)}`],
  ]
  if (sale.discount_amt > 0) {
    rows.push([`Discount (${sale.discount_pct}%):`, `-${sym}${sale.discount_amt.toFixed(2)}`])
  }
  if (sale.tax_amount > 0) {
    rows.push([`${profile.tax_name}:`, `${sym}${sale.tax_amount.toFixed(2)}`])
  }

  data.push({
    type: 'table',
    tableBody: rows.map(([k, v]) => [k, v]),
    tableBodyStyle: 'border: none; font-size: 12px;',
    style: 'width: 100%;',
  })

  // TOTAL (large)
  data.push(t(`TOTAL: ${sym}${sale.total_amount.toFixed(2)}`, true, 'right', '18px'))

  data.push(divider())

  // ── Payments ─────────────────────────────────────────────
  for (const pmt of sale.payments) {
    const method = pmt.method.charAt(0).toUpperCase() + pmt.method.slice(1)
    data.push(t(`Paid (${method}): ${sym}${pmt.amount.toFixed(2)}`, false, 'left', '12px'))
    if (pmt.reference) {
      data.push(t(`  Ref: ${pmt.reference}`, false, 'left', '10px'))
    }
  }
  if (sale.change_given > 0) {
    data.push(t(`Change: ${sym}${sale.change_given.toFixed(2)}`, true, 'left', '13px'))
  }

  // ── Barcode (receipt no) ─────────────────────────────────
  try {
    data.push({
      type: 'barcode',
      value: sale.receipt_no,
      height: 40,
      width: 1.5,
      displayValue: true,
      fontsize: 9,
      style: { textAlign: 'center', marginTop: '8px' },
    })
  } catch {
    // Barcode may not render on all printers — skip silently
  }

  data.push(divider('═'))

  // ── Footer ───────────────────────────────────────────────
  if (profile.receipt_footer) {
    data.push(t(profile.receipt_footer, false, 'center', '12px'))
  }
  data.push(t('Thank you for your patronage!', false, 'center', '12px'))
  data.push(t('Powered by NovaPOS', false, 'center', '10px'))
  data.push(t(' ', false, 'center', '10px')) // bottom margin

  return data
}

// ─── PRINT A SALE BY ID ───────────────────────────────────

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

  const { PosPrinter } = await import('electron-pos-printer')
  const content = buildReceiptContent(sale, profile)

  await PosPrinter.print(content as any, {
    printerName,
    preview: false,
    pageSize: paperWidth as any,
    copies: 1,
    silent: true,
  })

  logger.info(`[Printer] Printed receipt: ${sale.receipt_no} on ${printerName}`)
}

// ─── PRINT RAW CONTENT ───────────────────────────────────
// Used for test prints and pre-formatted content from renderer

export async function printRaw(content: unknown[]): Promise<void> {
  const db = getDb()
  const printerName = getSetting(db, 'printer_name')
  const paperWidth  = getSetting(db, 'paper_width') || '80mm'

  if (!printerName) throw new Error('No printer configured. Go to Settings → Printer.')

  const { PosPrinter } = await import('electron-pos-printer')
  await PosPrinter.print(content as any, {
    printerName,
    preview: false,
    pageSize: paperWidth as any,
    silent: true,
  })
}
