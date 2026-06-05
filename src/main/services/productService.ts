// src/main/services/productService.ts
import type { DB } from '../database/connection'
import { withTx } from '../database/connection'
import { Product, CreateProductDto, UpdateProductDto } from '@shared/types'
import logger from '../utils/logger'

// ─── Type map from DB row to Product ─────────────────────
// Handles all nullable new columns (migration 002)
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
  }
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
  const rows = db.prepare(
    `${SELECT} WHERE p.is_active = 1 AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?) ORDER BY p.name LIMIT 50`
  ).all([q, q, q]) as any[]
  return rows.map(toProduct)
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
    dto.has_bulk_pricing ? 1 : 0,
    dto.bulk_unit ?? null,    dto.units_per_bulk ?? 1,
    dto.bulk_buying_price ?? 0, dto.bulk_selling_price ?? 0,
    dto.stock_qty ?? 0,       dto.reorder_level ?? 5,
    dto.image_path ?? null,   dto.image_data ?? null,
    dto.description ?? null,
  ])
  return getProductById(db, Number(result.lastInsertRowid))!
}

export function updateProduct(db: DB, id: number, dto: Record<string, unknown>): Product {
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
  return getProductById(db, id)!
}

export function archiveProduct(db: DB, id: number): void {
  db.prepare(`UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run([id])
}

// ─── Receive stock (purchase receipt) ────────────────────
export interface StockReceiveInput {
  product_id:     number
  buy_mode:       'unit' | 'bulk'
  qty_received:   number        // units OR bulks depending on buy_mode
  cost_per_unit:  number        // calculated cost per retail unit
  total_cost:     number
  supplier_id?:   number
  notes?:         string
  new_selling_price?:       number
  new_bulk_selling_price?:  number
  recorded_by:    number
}

export function receiveStock(db: DB, input: StockReceiveInput): void {
  withTx(db, () => {
    const prod = db.prepare('SELECT stock_qty, selling_price FROM products WHERE id = ?')
      .get([input.product_id]) as { stock_qty: number; selling_price: number }

    const unitQty  = input.buy_mode === 'bulk'
      ? input.qty_received  // already total units
      : input.qty_received

    const newQty = prod.stock_qty + unitQty

    // Update stock + cost price + optional selling price
    const updates: string[]  = [`stock_qty = ?`, `cost_price = ?`, `updated_at = datetime('now')`]
    const vals:    unknown[] = [newQty, input.cost_per_unit]

    if (input.new_selling_price != null) {
      updates.push('selling_price = ?')
      vals.push(input.new_selling_price)
    }
    if (input.new_bulk_selling_price != null) {
      updates.push('bulk_selling_price = ?')
      vals.push(input.new_bulk_selling_price)
    }
    vals.push(input.product_id)

    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(vals)

    // Stock adjustment record
    db.prepare(`
      INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason, notes)
      VALUES (?, ?, ?, ?, ?, 'restock', ?)
    `).run([input.product_id, input.recorded_by, prod.stock_qty, unitQty, newQty, input.notes ?? null])

    // Price history
    db.prepare(`
      INSERT INTO purchase_price_history (product_id, supplier_id, cost_price, qty_bought, sell_unit, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run([
      input.product_id,
      input.supplier_id ?? null,
      input.cost_per_unit,
      unitQty,
      input.buy_mode,
      input.notes ?? null,
      input.recorded_by,
    ])
  })

  logger.info(`[ProductService] Stock received: product #${input.product_id}, +${input.qty_received} ${input.buy_mode}`)
}

// ─── Bulk import ─────────────────────────────────────────
export function bulkImportProducts(db: DB, rows: any[], userId: number) {
  const result = { imported: 0, skipped: 0, errors: [] as any[] }
  const getCat = db.prepare('SELECT id FROM categories WHERE name = ?')
  const ins    = db.prepare(`
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
      if (!row.name?.trim()) { result.errors.push({row:i+1,reason:'Missing name'}); result.skipped++; return }
      try {
        const catRow = row.category ? getCat.get([row.category]) as any : null
        const r = ins.run([
          row.name.trim(), row.sku??null, row.barcode??null,
          catRow?.id??null, row.unit??'pcs',
          Number(row.cost_price)||0, Number(row.selling_price)||0,
          row.bulk_unit ? 1 : 0, row.bulk_unit??null, Number(row.units_per_bulk)||1,
          Number(row.bulk_buying_price)||0, Number(row.bulk_selling_price)||0,
          Number(row.stock_qty)||0, Number(row.reorder_level)||5,
        ])
        if (r.changes === 0) { result.skipped++; result.errors.push({row:i+1,reason:`Duplicate: "${row.name}"`}); return }
        const pid = Number(r.lastInsertRowid)
        const qty = Number(row.stock_qty)||0
        if (qty > 0) adj.run([pid, userId, qty, qty])
        result.imported++
      } catch (e: any) { result.errors.push({row:i+1,reason:e.message}); result.skipped++ }
    })
  })

  logger.info(`[ProductService] Bulk import: ${result.imported} imported, ${result.skipped} skipped`)
  return result
}
