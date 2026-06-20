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

  // ── Snapshot VAT policy at time of sale ──────────────────
  // VAT rates can change. This permanently records WHICH rate was applied
  // to this sale. Past records are IMMUTABLE — never recalculate them
  // using the current VAT setting.
  const taxProfile = db.prepare(
    'SELECT tax_rate, tax_inclusive FROM business_profile WHERE id = 1'
  ).get() as { tax_rate: number; tax_inclusive: number } | undefined

  const taxRateApplied      = taxProfile?.tax_rate     ?? 7.5
  const taxInclusiveApplied = taxProfile?.tax_inclusive ?  1  : 0

  const saleId = withTx(db, () => {
    // ── Build full item snapshot BEFORE inserting ─────────
    // items_json stores everything needed to reprint/audit this sale
    // even if products are renamed, repriced, or deleted later.
    // total_cost_amount = what the goods cost us at the moment of sale.
    let totalCostAmount = 0
    const itemSnapshots = input.items.map(item => {
      const prod = db.prepare('SELECT cost_price FROM products WHERE id = ?')
        .get([item.product_id]) as { cost_price: number } | undefined
      const costPrice = prod?.cost_price ?? 0
      // Cost of goods for this line, in pieces. Bulk lines sell cartons, so
      // the piece count = quantity × units_per_bulk.
      const isBulk  = ((item as any).sell_mode ?? 'unit') === 'bulk'
      const perBulk = (item as any)._upb ?? (item as any).units_per_bulk ?? 1
      const pieces  = isBulk ? item.quantity * perBulk : item.quantity
      totalCostAmount += costPrice * pieces
      return {
        product_id:   item.product_id,
        product_name: item.product_name,
        unit_price:   item.unit_price,   // selling price at moment of sale
        cost_price:   costPrice,         // buying price at moment of sale
        quantity:     item.quantity,
        discount_pct: item.discount_pct,
        line_total:   item.line_total,
        sell_mode:    (item as any).sell_mode ?? 'unit',
      }
    })

    const saleResult = db.prepare(`
      INSERT INTO sales (
        receipt_no, customer_id, served_by,
        subtotal, discount_pct, discount_amt,
        tax_amount, total_amount, amount_paid, change_given, status,
        tax_rate_applied, tax_inclusive_applied,
        items_json, total_cost_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
    `).run([
      receiptNo, input.customer_id ?? null, input.served_by,
      subtotal, input.discount_pct, input.discount_amt,
      input.tax_amount, input.total_amount, amountPaid, change,
      taxRateApplied, taxInclusiveApplied,
      JSON.stringify(itemSnapshots), totalCostAmount,
    ])
    const id = Number(saleResult.lastInsertRowid)

    for (const item of input.items) {
      // Snapshot cost_price from products at moment of sale.
      // If product prices change later, THIS record stays accurate.
      const prod = db.prepare('SELECT stock_qty, cost_price FROM products WHERE id = ?')
        .get([item.product_id]) as { stock_qty: number; cost_price: number } | undefined
      const qtyBefore = prod?.stock_qty ?? 0

      // CRITICAL: stock_qty is always in base PIECES. A bulk line's quantity
      // is in cartons, so convert to pieces before deducting. Selling 1
      // carton of 40 must remove 40 pieces, not 1.
      const isBulk    = ((item as any).sell_mode ?? 'unit') === 'bulk'
      const perBulk   = (item as any)._upb ?? (item as any).units_per_bulk ?? 1
      const piecesOut = isBulk ? item.quantity * perBulk : item.quantity

      // Guard against overselling — never let stock go negative. This catches
      // race conditions (two terminals selling the last unit) and stale carts.
      if (piecesOut > qtyBefore) {
        throw new Error(
          `Not enough stock for "${item.product_name}": ${qtyBefore} available, ${piecesOut} requested`
        )
      }
      const qtyAfter = qtyBefore - piecesOut

      db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, quantity, discount_pct, line_total, cost_price, sell_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run([
        id, item.product_id, item.product_name,
        item.unit_price, item.quantity, item.discount_pct, item.line_total,
        prod?.cost_price ?? 0, (item as any).sell_mode ?? 'unit',
      ])

      db.prepare(`UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?`)
        .run([qtyAfter, item.product_id])

      db.prepare(`
        INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason)
        VALUES (?, ?, ?, ?, ?, 'sale')
      `).run([item.product_id, input.served_by, qtyBefore, -piecesOut, qtyAfter])
    }

    for (const pmt of input.payments) {
      db.prepare('INSERT INTO payments (sale_id, method, amount, reference) VALUES (?, ?, ?, ?)')
        .run([id, pmt.method, pmt.amount, pmt.reference ?? null])
    }

    db.prepare(`
      INSERT INTO activity_log (user_id, action, entity_type, entity_id, detail)
      VALUES (?, 'sale.complete', 'sale', ?, ?)
    `).run([input.served_by, id, `Receipt ${receiptNo}, Total ₦${input.total_amount}, VAT ${taxRateApplied}%`])

    // ── Auto price-switch check ───────────────────────────
    // A product can have a PENDING price (set during restock with the
    // "sell old stock first, then switch" option). The switch fires once
    // the old stock has sold down to the recorded threshold quantity.
    //
    // A pending switch may carry a new UNIT price, a new BULK price, or
    // both — so we trigger if EITHER pending price exists (not just unit).
    // This makes the feature work for unit-only, bulk-only, and dual-price
    // products alike.
    //
    // Only check products that were actually sold in THIS sale, since their
    // stock just dropped and may have crossed the threshold.
    const checkedProductIds = new Set<number>()
    for (const item of input.items) {
      if (checkedProductIds.has(item.product_id)) continue   // avoid double-check
      checkedProductIds.add(item.product_id)

      const p = db.prepare(
        `SELECT stock_qty, selling_price, bulk_selling_price,
                pending_sell_price, pending_bulk_price, price_switch_at_qty
         FROM products WHERE id = ?`
      ).get([item.product_id]) as {
        stock_qty: number
        selling_price: number
        bulk_selling_price: number
        pending_sell_price: number | null
        pending_bulk_price: number | null
        price_switch_at_qty: number | null
      } | undefined
      if (!p) continue

      const hasPending = p.pending_sell_price != null || p.pending_bulk_price != null
      const thresholdSet = p.price_switch_at_qty != null
      const reachedThreshold = thresholdSet && p.stock_qty <= (p.price_switch_at_qty as number)

      if (hasPending && reachedThreshold) {
        // Apply whichever pending prices exist; keep current for the other.
        const newSell = p.pending_sell_price ?? p.selling_price
        const newBulk = p.pending_bulk_price ?? p.bulk_selling_price

        db.prepare(`
          UPDATE products SET
            selling_price       = ?,
            bulk_selling_price  = ?,
            pending_sell_price  = NULL,
            pending_bulk_price  = NULL,
            price_switch_at_qty = NULL,
            updated_at = datetime('now')
          WHERE id = ?
        `).run([newSell, newBulk, item.product_id])

        const parts: string[] = []
        if (p.pending_sell_price != null) parts.push(`unit ₦${p.pending_sell_price}`)
        if (p.pending_bulk_price != null) parts.push(`bulk ₦${p.pending_bulk_price}`)

        db.prepare(`
          INSERT INTO activity_log (user_id, action, entity_type, entity_id, detail)
          VALUES (?, 'product.price_auto_switch', 'product', ?, ?)
        `).run([
          input.served_by, item.product_id,
          `Old stock sold out — auto-switched to ${parts.join(', ')} (at stock ${p.stock_qty})`,
        ])

        logger.info(`[SaleService] Auto price-switch for product #${item.product_id}: ${parts.join(', ')}`)
      }
    }

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
    db.prepare(`UPDATE sales SET status = 'voided', void_reason = ? WHERE id = ?`)
      .run([reason, saleId])

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all([saleId]) as SaleItem[]
    for (const item of items) {
      const prod = db.prepare('SELECT stock_qty, units_per_bulk FROM products WHERE id = ?').get([item.product_id]) as
        { stock_qty: number; units_per_bulk: number } | undefined
      const qtyBefore = prod?.stock_qty ?? 0
      // Restock in PIECES. A bulk line's quantity is in cartons, so convert
      // back using the product's units_per_bulk (mirrors the sale deduction).
      const isBulk    = (item as any).sell_mode === 'bulk'
      const perBulk   = prod?.units_per_bulk ?? 1
      const piecesBack = isBulk ? item.quantity * perBulk : item.quantity
      const qtyAfter  = qtyBefore + piecesBack

      db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run([qtyAfter, item.product_id])
      db.prepare(`
        INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason, notes)
        VALUES (?, ?, ?, ?, ?, 'correction', ?)
      `).run([item.product_id, userId, qtyBefore, piecesBack, qtyAfter, `Void of sale #${saleId}`])
    }

    db.prepare(`
      INSERT INTO activity_log (user_id, action, entity_type, entity_id, detail)
      VALUES (?, 'sale.void', 'sale', ?, ?)
    `).run([userId, saleId, reason])
  })

  logger.info(`[SaleService] Voided sale #${saleId}`)
}

export function holdSale(db: DB, cartJson: string, label: string | null, customerId: number | null, userId: number): number {
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
  `).get([id]) as Sale | undefined
  if (!sale) return null

  const items    = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all([id]) as SaleItem[]
  const payments = db.prepare('SELECT * FROM payments WHERE sale_id = ?').all([id]) as PaymentRecord[]
  return { ...sale, items, payments }
}
