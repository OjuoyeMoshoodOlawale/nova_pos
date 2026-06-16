// src/main/services/productService.ts
import type { DB } from '../database/connection'
import { withTx } from '../database/connection'
import { Product, CreateProductDto, UpdateProductDto } from '@shared/types'
import logger from '../utils/logger'

// ─── Type map from DB row to Product ─────────────────────
function toProduct(r: Record<string, unknown>): Product {
  return {
    id:                  r.id as number,
    name:                r.name as string,
    sku:                 (r.sku as string) || null,
    barcode:             (r.barcode as string) || null,
    category_id:         (r.category_id as number) || null,
    category_name:       (r.category_name as string) || null,
    supplier_id:         (r.supplier_id as number) || null,
    supplier_name:       (r.supplier_name as string) || null,
    parent_id:           (r.parent_id as number) || null,
    unit:                (r.unit as string) || 'pcs',
    cost_price:          Number(r.cost_price) || 0,
    selling_price:       Number(r.selling_price) || 0,
    has_bulk_pricing:    Boolean(r.has_bulk_pricing),
    bulk_unit:           (r.bulk_unit as string) || null,
    units_per_bulk:      Number(r.units_per_bulk) || 1,
    bulk_buying_price:   Number(r.bulk_buying_price) || 0,
    bulk_selling_price:  Number(r.bulk_selling_price) || 0,
    stock_qty:           Number(r.stock_qty) || 0,
    reorder_level:       Number(r.reorder_level) || 5,
    image_path:          (r.image_path as string) || null,
    image_data:          (r.image_data as string) || null,
    description:         (r.description as string) || null,
    is_active:           Boolean(r.is_active ?? 1),
    created_at:          r.created_at as string,
    updated_at:          r.updated_at as string,
    pending_sell_price:  r.pending_sell_price != null ? Number(r.pending_sell_price) : null,
    pending_bulk_price:  r.pending_bulk_price != null ? Number(r.pending_bulk_price) : null,
    price_switch_at_qty: r.price_switch_at_qty != null ? Number(r.price_switch_at_qty) : null,
  } as any
}

const SELECT = `
  SELECT p.*, c.name AS category_name, s.name AS supplier_name
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN suppliers  s ON p.supplier_id  = s.id
`

export function getAllProducts(db: DB, activeOnly = true): Product[] {
  const clause = activeOnly ? 'WHERE p.is_active = 1' : ''
  return (db.prepare(`${SELECT} ${clause} ORDER BY p.name`).all() as any[]).map(toProduct)
}

export function getProductById(db: DB, id: number): Product | null {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get([id]) as any
  return row ? toProduct(row) : null
}

export function findByBarcode(db: DB, barcode: string): Product | null {
  const row = db.prepare(`${SELECT} WHERE p.barcode = ? AND p.is_active = 1`).get([barcode]) as any
  return row ? toProduct(row) : null
}

export function searchProducts(db: DB, query: string): Product[] {
  const q = `%${query}%`
  return (db.prepare(
    `${SELECT} WHERE p.is_active = 1 AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?) ORDER BY p.name LIMIT 50`
  ).all([q, q, q]) as any[]).map(toProduct)
}

export function getLowStockProducts(db: DB): Product[] {
  return (db.prepare(
    `${SELECT} WHERE p.is_active = 1 AND p.stock_qty <= p.reorder_level ORDER BY p.stock_qty ASC`
  ).all() as any[]).map(toProduct)
}

export function createProduct(db: DB, dto: Partial<Product> & { name: string }): Product {
  const result = db.prepare(`
    INSERT INTO products (
      name, sku, barcode, category_id, supplier_id, parent_id,
      unit, cost_price, selling_price,
      has_bulk_pricing, bulk_unit, units_per_bulk, bulk_buying_price, bulk_selling_price,
      stock_qty, reorder_level, image_path, image_data, description
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run([
    dto.name,
    dto.sku ?? null,          dto.barcode ?? null,
    dto.category_id ?? null,  dto.supplier_id ?? null,  null,
    dto.unit ?? 'pcs',
    dto.cost_price ?? 0,      dto.selling_price ?? 0,
    (dto as any).has_bulk_pricing ? 1 : 0,
    (dto as any).bulk_unit    ?? null,
    (dto as any).units_per_bulk ?? 1,
    (dto as any).bulk_buying_price  ?? 0,
    (dto as any).bulk_selling_price ?? 0,
    dto.stock_qty ?? 0,       dto.reorder_level ?? 5,
    dto.image_path ?? null,   (dto as any).image_data ?? null,
    dto.description ?? null,
  ])
  return getProductById(db, Number(result.lastInsertRowid))!
}

export function updateProduct(db: DB, id: number, dto: Record<string, unknown>, changedBy?: number): Product {
  const before = db.prepare(
    'SELECT cost_price, selling_price, bulk_selling_price FROM products WHERE id = ?'
  ).get([id]) as { cost_price: number; selling_price: number; bulk_selling_price: number } | undefined

  const allowed = [
    'name','sku','barcode','category_id','supplier_id','unit',
    'cost_price','selling_price','stock_qty','reorder_level','description',
    'has_bulk_pricing','bulk_unit','units_per_bulk','bulk_buying_price','bulk_selling_price',
    'image_path','image_data',
  ]
  const sets: string[] = [`updated_at = datetime('now')`]
  const vals: unknown[] = []

  for (const k of allowed) {
    if (k in dto) {
      const v = dto[k]
      sets.push(`${k} = ?`)
      vals.push(k === 'has_bulk_pricing' ? (v ? 1 : 0) : (v ?? null))
    }
  }
  vals.push(id)
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(vals)

  const newCost = dto.cost_price         != null ? Number(dto.cost_price)          : before?.cost_price
  const newSell = dto.selling_price      != null ? Number(dto.selling_price)       : before?.selling_price
  const newBulk = dto.bulk_selling_price != null ? Number(dto.bulk_selling_price)  : before?.bulk_selling_price

  const priceChanged =
    (newCost != null && before?.cost_price          != null && Math.abs(newCost  - before.cost_price)          > 0.001) ||
    (newSell != null && before?.selling_price        != null && Math.abs(newSell  - before.selling_price)        > 0.001) ||
    (newBulk != null && before?.bulk_selling_price   != null && Math.abs(newBulk  - before.bulk_selling_price)   > 0.001)

  if (before && priceChanged) {
    db.prepare(`
      INSERT INTO selling_price_history
        (product_id, changed_by, old_cost_price, new_cost_price, old_sell_price, new_sell_price, old_bulk_price, new_bulk_price, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([
      id, changedBy ?? null,
      before.cost_price,          newCost ?? before.cost_price,
      before.selling_price,       newSell ?? before.selling_price,
      before.bulk_selling_price,  newBulk ?? before.bulk_selling_price,
      (dto.reason as string) ?? 'manual_update',
    ])
    logger.info(`[ProductService] Price change logged for product #${id}`)
  }

  return getProductById(db, id)!
}

export function archiveProduct(db: DB, id: number): void {
  db.prepare(`UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run([id])
}

// ─── Receive stock (purchase receipt) ────────────────────
export type PriceMode = 'keep' | 'switch_now' | 'auto_switch'

export interface StockReceiveInput {
  product_id:              number
  buy_mode:                'unit' | 'bulk'
  qty_received:            number        // total RETAIL units already computed
  cost_per_unit:           number        // cost per retail unit (bulk_cost ÷ units_per_bulk)
  total_cost:              number
  supplier_id?:            number
  notes?:                  string
  invoice_ref?:            string        // supplier invoice / delivery note number
  price_mode:              PriceMode
  new_selling_price?:      number
  new_bulk_selling_price?: number
  switch_at_qty?:          number
  recorded_by:             number
}

export function receiveStock(db: DB, input: StockReceiveInput): void {
  withTx(db, () => {
    // Fetch existing prices BEFORE updating (needed for audit trail)
    const prod = db.prepare(`
      SELECT stock_qty, cost_price, selling_price, bulk_selling_price
      FROM products WHERE id = ?
    `).get([input.product_id]) as {
      stock_qty: number
      cost_price: number
      selling_price: number
      bulk_selling_price: number
    }

    const newQty = prod.stock_qty + input.qty_received

    // ── Build UPDATE ──────────────────────────────────────
    const updates: string[] = [`stock_qty = ?`, `cost_price = ?`, `updated_at = datetime('now')`]
    const vals: unknown[]   = [newQty, input.cost_per_unit]

    let newSellPrice = prod.selling_price
    let newBulkPrice = prod.bulk_selling_price

    if (input.price_mode === 'switch_now') {
      if (input.new_selling_price != null) {
        updates.push('selling_price = ?')
        vals.push(input.new_selling_price)
        newSellPrice = input.new_selling_price
      }
      if (input.new_bulk_selling_price != null) {
        updates.push('bulk_selling_price = ?')
        vals.push(input.new_bulk_selling_price)
        newBulkPrice = input.new_bulk_selling_price
      }
      updates.push('pending_sell_price = NULL', 'pending_bulk_price = NULL', 'price_switch_at_qty = NULL')

    } else if (input.price_mode === 'auto_switch') {
      // "Sell old stock at the current price, then switch."
      // The OLD units (prod.stock_qty before this receipt) keep the old
      // price. After receiving, total = prod.stock_qty + qty_received.
      // The new price should begin once those OLD units are sold — i.e.
      // when stock drops to (newQty - oldStock) = qty_received remaining.
      //
      // We compute the threshold from the CURRENT stock so it's correct
      // regardless of what the caller passes:
      //   threshold = newQty - oldStock = qty_received
      // Stored explicitly (not relying on the caller) for clarity & safety.
      const oldStock  = prod.stock_qty
      const threshold = input.switch_at_qty ?? (newQty - oldStock)

      updates.push('pending_sell_price = ?', 'pending_bulk_price = ?', 'price_switch_at_qty = ?')
      vals.push(
        input.new_selling_price      ?? null,
        input.new_bulk_selling_price ?? null,
        threshold,
      )
      // Pending prices don't take effect yet — keep old for reporting
      newSellPrice = input.new_selling_price      ?? prod.selling_price
      newBulkPrice = input.new_bulk_selling_price ?? prod.bulk_selling_price
    }
    // 'keep' mode: only update stock and cost

    vals.push(input.product_id)
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(vals)

    // ── Selling price history log ─────────────────────────
    // Log to selling_price_history whenever cost OR sell price changes during a restock.
    // This makes the "Price Changes" tab in ProductForm show restock-driven price changes.
    const costChanged = Math.abs(input.cost_per_unit - prod.cost_price) > 0.001
    const sellChanged =
      input.price_mode !== 'keep' && (
        Math.abs(newSellPrice - prod.selling_price)   > 0.001 ||
        Math.abs(newBulkPrice - prod.bulk_selling_price) > 0.001
      )

    if (costChanged || sellChanged) {
      db.prepare(`
        INSERT INTO selling_price_history
          (product_id, changed_by, old_cost_price, new_cost_price, old_sell_price, new_sell_price, old_bulk_price, new_bulk_price, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'restock')
      `).run([
        input.product_id,
        input.recorded_by,
        prod.cost_price,      input.cost_per_unit,
        prod.selling_price,   newSellPrice,
        prod.bulk_selling_price, newBulkPrice,
      ])
    }

    // ── Stock adjustment record ───────────────────────────
    db.prepare(`
      INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason, notes)
      VALUES (?, ?, ?, ?, ?, 'restock', ?)
    `).run([
      input.product_id, input.recorded_by,
      prod.stock_qty, input.qty_received, newQty,
      input.notes ?? null,
    ])

    // ── Purchase price history record ─────────────────────
    // invoice_ref column added in migration 006
    db.prepare(`
      INSERT INTO purchase_price_history
        (product_id, supplier_id, cost_price, qty_bought, sell_unit, notes, invoice_ref, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run([
      input.product_id,
      input.supplier_id   ?? null,
      input.cost_per_unit,
      input.qty_received,
      input.buy_mode,
      input.notes         ?? null,
      input.invoice_ref   ?? null,
      input.recorded_by,
    ])
  })

  logger.info(`[ProductService] Stock received: product #${input.product_id}, +${input.qty_received}`)
}

// ─── Bulk import ─────────────────────────────────────────
export function bulkImportProducts(db: DB, rows: any[], userId: number) {
  const result = { imported: 0, skipped: 0, errors: [] as any[] }
  const getCat = db.prepare('SELECT id FROM categories WHERE name = ?')
  const ins = db.prepare(`
    INSERT OR IGNORE INTO products (name, sku, barcode, category_id, unit, cost_price, selling_price,
    has_bulk_pricing, bulk_unit, units_per_bulk, bulk_buying_price, bulk_selling_price, stock_qty, reorder_level)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  const adj = db.prepare(`
    INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason)
    VALUES (?,?,0,?,?,'opening_balance')
  `)

  withTx(db, () => {
    rows.forEach((row, i) => {
      if (!row.name?.trim()) { result.errors.push({ row: i + 1, reason: 'Missing name' }); result.skipped++; return }
      try {
        const catRow = row.category ? getCat.get([row.category]) as any : null
        const r = ins.run([
          row.name.trim(), row.sku ?? null, row.barcode ?? null,
          catRow?.id ?? null, row.unit ?? 'pcs',
          Number(row.cost_price) || 0, Number(row.selling_price) || 0,
          row.bulk_unit ? 1 : 0, row.bulk_unit ?? null, Number(row.units_per_bulk) || 1,
          Number(row.bulk_buying_price) || 0, Number(row.bulk_selling_price) || 0,
          Number(row.stock_qty) || 0, Number(row.reorder_level) || 5,
        ])
        if (r.changes === 0) { result.skipped++; result.errors.push({ row: i + 1, reason: `Duplicate: "${row.name}"` }); return }
        const pid = Number(r.lastInsertRowid)
        const qty = Number(row.stock_qty) || 0
        if (qty > 0) adj.run([pid, userId, qty, qty])
        result.imported++
      } catch (e: any) { result.errors.push({ row: i + 1, reason: e.message }); result.skipped++ }
    })
  })

  logger.info(`[ProductService] Bulk import: ${result.imported} imported, ${result.skipped} skipped`)
  return result
}
