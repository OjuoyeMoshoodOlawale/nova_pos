// src/main/services/saleService.ts
import type { DB } from '../database/connection'
import { withTx } from '../database/connection'
import { format } from 'date-fns'
import { CompleteSaleInput, CompleteSaleResult, Sale, SaleDetail, SaleItem, PaymentRecord } from '@shared/types'
import logger from '../utils/logger'

export function generateReceiptNo(db: DB): string {
  const today  = format(new Date(), 'yyyyMMdd')
  const prefix = `INV-${today}-`
  const last   = db.prepare(
    'SELECT receipt_no FROM sales WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1'
  ).get([`${prefix}%`]) as { receipt_no: string } | undefined
  const seq = last ? parseInt(last.receipt_no.split('-').pop() ?? '0') + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

export function completeSale(db: DB, input: CompleteSaleInput): CompleteSaleResult {
  const receiptNo  = generateReceiptNo(db)
  const amountPaid = input.payments.reduce((s, p) => s + p.amount, 0)
  const change     = Math.max(0, amountPaid - input.total_amount)
  const subtotal   = input.items.reduce((s, i) => s + i.line_total, 0) + input.discount_amt

  const saleId = withTx(db, () => {
    const saleResult = db.prepare(`
      INSERT INTO sales (
        receipt_no, customer_id, served_by,
        subtotal, discount_pct, discount_amt,
        tax_amount, total_amount, amount_paid, change_given, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).run([
      receiptNo, input.customer_id ?? null, input.served_by,
      subtotal, input.discount_pct, input.discount_amt,
      input.tax_amount, input.total_amount, amountPaid, change,
    ])
    const id = Number(saleResult.lastInsertRowid)

    for (const item of input.items) {
      // Get cost_price snapshot before deducting stock
      const prod = db.prepare('SELECT stock_qty, cost_price FROM products WHERE id = ?')
        .get([item.product_id]) as { stock_qty: number; cost_price: number } | undefined
      const qtyBefore = prod?.stock_qty ?? 0
      const qtyAfter  = qtyBefore - item.quantity

      db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, quantity, discount_pct, line_total, cost_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run([id, item.product_id, item.product_name, item.unit_price, item.quantity, item.discount_pct, item.line_total, prod?.cost_price ?? 0])

      db.prepare('UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?')
        .run([qtyAfter, item.product_id])

      db.prepare(`
        INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason)
        VALUES (?, ?, ?, ?, ?, 'sale')
      `).run([item.product_id, input.served_by, qtyBefore, -item.quantity, qtyAfter])
    }

    for (const pmt of input.payments) {
      db.prepare('INSERT INTO payments (sale_id, method, amount, reference) VALUES (?, ?, ?, ?)')
        .run([id, pmt.method, pmt.amount, pmt.reference ?? null])
    }

    db.prepare(`
      INSERT INTO activity_log (user_id, action, entity_type, entity_id, detail)
      VALUES (?, 'sale.complete', 'sale', ?, ?)
    `).run([input.served_by, id, `Receipt ${receiptNo}, Total ₦${input.total_amount}`])

    return id
  })

  logger.info(`[SaleService] Completed: ${receiptNo}`)
  return { saleId, receiptNo, change }
}

export function voidSale(db: DB, saleId: number, reason: string, userId: number): void {
  const sale = db.prepare('SELECT status FROM sales WHERE id = ?').get([saleId]) as
    { status: string } | undefined
  if (!sale) throw new Error('Sale not found')
  if (sale.status === 'voided') throw new Error('Sale is already voided')

  withTx(db, () => {
    db.prepare("UPDATE sales SET status = 'voided', void_reason = ?, updated_at = datetime('now') WHERE id = ?")
      .run([reason, saleId])

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all([saleId]) as SaleItem[]
    for (const item of items) {
      const prod = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get([item.product_id]) as
        { stock_qty: number } | undefined
      const qtyBefore = prod?.stock_qty ?? 0
      const qtyAfter  = qtyBefore + item.quantity

      db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run([qtyAfter, item.product_id])
      db.prepare(`
        INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason, notes)
        VALUES (?, ?, ?, ?, ?, 'correction', ?)
      `).run([item.product_id, userId, qtyBefore, item.quantity, qtyAfter, `Void of sale #${saleId}`])
    }

    db.prepare("INSERT INTO activity_log (user_id, action, entity_type, entity_id, detail) VALUES (?, 'sale.void', 'sale', ?, ?)")
      .run([userId, saleId, reason])
  })

  logger.info(`[SaleService] Voided sale #${saleId}`)
}

export function holdSale(db: DB, cartJson: string, label: string|null, customerId: number|null, userId: number): number {
  const result = db.prepare('INSERT INTO held_orders (label, cart_json, customer_id, held_by) VALUES (?, ?, ?, ?)')
    .run([label, cartJson, customerId, userId])
  return Number(result.lastInsertRowid)
}

export function getHeldOrders(db: DB) {
  return db.prepare('SELECT * FROM held_orders ORDER BY held_at DESC').all()
}

export function releaseHeldOrder(db: DB, id: number): string {
  const row = db.prepare('SELECT cart_json FROM held_orders WHERE id = ?').get([id]) as
    { cart_json: string } | undefined
  if (!row) throw new Error('Held order not found')
  db.prepare('DELETE FROM held_orders WHERE id = ?').run([id])
  return row.cart_json
}

export function getSales(
  db: DB,
  filters: { dateFrom?: string; dateTo?: string; status?: string; cashierId?: number } = {}
): Sale[] {
  const where: string[] = []
  const params: unknown[] = []

  if (filters.dateFrom) { where.push('s.sale_date >= ?'); params.push(filters.dateFrom) }
  if (filters.dateTo)   { where.push('s.sale_date <= ?'); params.push(filters.dateTo)   }
  if (filters.status)   { where.push('s.status = ?');     params.push(filters.status)   }
  if (filters.cashierId){ where.push('s.served_by = ?');  params.push(filters.cashierId)}

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  return db.prepare(`
    SELECT s.*, c.full_name AS customer_name, u.full_name AS cashier_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    JOIN users u ON s.served_by = u.id
    ${clause}
    ORDER BY s.sale_date DESC LIMIT 500
  `).all(params) as Sale[]
}

export function getSaleById(db: DB, id: number): SaleDetail | null {
  const sale = db.prepare(`
    SELECT s.*, c.full_name AS customer_name, u.full_name AS cashier_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    JOIN users u ON s.served_by = u.id
    WHERE s.id = ?
  `).get([id]) as Sale|undefined
  if (!sale) return null

  const items    = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all([id]) as SaleItem[]
  const payments = db.prepare('SELECT * FROM payments WHERE sale_id = ?').all([id]) as PaymentRecord[]
  return { ...sale, items, payments }
}
