// src/main/services/productService.ts
import type { DB } from '../database/connection'
import { withTx } from '../database/connection'
import { Product, CreateProductDto, UpdateProductDto } from '@shared/types'
import logger from '../utils/logger'

type RawProduct = Omit<Product, 'is_active'|'category_name'|'supplier_name'> & {
  is_active: number; category_name: string|null; supplier_name: string|null
}

const SELECT_PRODUCT = `
  SELECT p.*, c.name AS category_name, s.name AS supplier_name
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN suppliers  s ON p.supplier_id  = s.id
`

const toProduct = (r: RawProduct): Product => ({ ...r, is_active: Boolean(r.is_active) })

export function getAllProducts(db: DB, activeOnly = true): Product[] {
  const rows = db.prepare(
    `${SELECT_PRODUCT} WHERE ${activeOnly ? 'p.is_active = 1 AND ' : ''}1=1 ORDER BY p.name`
  ).all() as RawProduct[]
  return rows.map(toProduct)
}

export function getProductById(db: DB, id: number): Product | null {
  const row = db.prepare(`${SELECT_PRODUCT} WHERE p.id = ?`).get([id]) as RawProduct|undefined
  return row ? toProduct(row) : null
}

export function findByBarcode(db: DB, barcode: string): Product | null {
  const row = db.prepare(`${SELECT_PRODUCT} WHERE p.barcode = ? AND p.is_active = 1`)
    .get([barcode]) as RawProduct|undefined
  return row ? toProduct(row) : null
}

export function searchProducts(db: DB, query: string): Product[] {
  const q = `%${query}%`
  const rows = db.prepare(
    `${SELECT_PRODUCT}
     WHERE p.is_active = 1 AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)
     ORDER BY p.name LIMIT 50`
  ).all([q, q, q]) as RawProduct[]
  return rows.map(toProduct)
}

export function getLowStockProducts(db: DB): Product[] {
  const rows = db.prepare(
    `${SELECT_PRODUCT} WHERE p.is_active = 1 AND p.stock_qty <= p.reorder_level ORDER BY p.stock_qty ASC`
  ).all() as RawProduct[]
  return rows.map(toProduct)
}

export function createProduct(db: DB, dto: CreateProductDto): Product {
  const result = db.prepare(`
    INSERT INTO products (
      name, sku, barcode, category_id, supplier_id, parent_id,
      unit, cost_price, selling_price, stock_qty, reorder_level,
      image_path, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    dto.name, dto.sku ?? null, dto.barcode ?? null,
    dto.category_id ?? null, dto.supplier_id ?? null, dto.parent_id ?? null,
    dto.unit ?? 'pcs', dto.cost_price, dto.selling_price,
    dto.stock_qty ?? 0, dto.reorder_level ?? 5,
    dto.image_path ?? null, dto.description ?? null,
  ])
  return getProductById(db, Number(result.lastInsertRowid))!
}

export function updateProduct(db: DB, id: number, dto: UpdateProductDto): Product {
  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  const fields: (keyof UpdateProductDto)[] = [
    'name','sku','barcode','category_id','supplier_id','unit',
    'cost_price','selling_price','stock_qty','reorder_level','description',
  ]
  for (const k of fields) {
    if (k in dto) { sets.push(`${k} = ?`); vals.push((dto as Record<string, unknown>)[k]) }
  }
  vals.push(id)
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(vals)
  return getProductById(db, id)!
}

export function archiveProduct(db: DB, id: number): void {
  db.prepare("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run([id])
}

// ─── Bulk import ─────────────────────────────────────────
export interface BulkImportRow {
  name: string; sku?: string; barcode?: string; category?: string; unit?: string
  cost_price?: number; selling_price?: number; stock_qty?: number; reorder_level?: number
}

export interface BulkImportResult {
  imported: number; skipped: number; errors: { row: number; reason: string }[]
}

export function bulkImportProducts(db: DB, rows: BulkImportRow[], userId: number): BulkImportResult {
  const result: BulkImportResult = { imported: 0, skipped: 0, errors: [] }

  const getCategoryId = db.prepare('SELECT id FROM categories WHERE name = ?')
  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products (name, sku, barcode, category_id, unit, cost_price, selling_price, stock_qty, reorder_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const logAdjustment = db.prepare(
    'INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason) VALUES (?, ?, 0, ?, ?, ?)'
  )

  withTx(db, () => {
    rows.forEach((row, i) => {
      if (!row.name?.trim()) {
        result.errors.push({ row: i+1, reason: 'Missing product name' }); result.skipped++; return
      }
      try {
        const catRow = row.category
          ? (getCategoryId.get([row.category]) as { id: number } | undefined)
          : undefined

        const r = insertProduct.run([
          row.name.trim(), row.sku ?? null, row.barcode ?? null,
          catRow?.id ?? null, row.unit ?? 'pcs',
          row.cost_price ?? 0, row.selling_price ?? 0,
          row.stock_qty ?? 0, row.reorder_level ?? 5,
        ])

        if (r.changes === 0) {
          result.skipped++; result.errors.push({ row: i+1, reason: `Duplicate: "${row.name}"` }); return
        }

        const pid = Number(r.lastInsertRowid)
        const qty = row.stock_qty ?? 0
        if (qty > 0) logAdjustment.run([pid, userId, qty, qty, 'opening_balance'])
        result.imported++
      } catch (err: unknown) {
        result.errors.push({ row: i+1, reason: (err as Error).message }); result.skipped++
      }
    })
  })

  logger.info(`[ProductService] Bulk import: ${result.imported} imported, ${result.skipped} skipped`)
  return result
}
