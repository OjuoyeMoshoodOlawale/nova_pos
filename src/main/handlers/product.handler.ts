// src/main/handlers/product.handler.ts
import type { DB } from '../database/connection'
import { safeHandle }      from '../utils/safeHandle'
import * as productService from '../services/productService'
import { CH }              from '@shared/ipcChannels'

export function registerProductHandlers(db: DB): void {

  safeHandle(CH.PRODUCT_ALL,         ()              => productService.getAllProducts(db))
  safeHandle(CH.PRODUCT_SEARCH,      (_e, q: string) => productService.searchProducts(db, q))
  safeHandle(CH.PRODUCT_BARCODE,     (_e, b: string) => productService.findByBarcode(db, b))
  safeHandle(CH.PRODUCT_GET,         (_e, id:number) => productService.getProductById(db, id))
  safeHandle(CH.PRODUCT_CREATE,      (_e, d: unknown) => productService.createProduct(db, d as any))
  safeHandle(CH.PRODUCT_UPDATE,      (_e, id:number, d:unknown) => productService.updateProduct(db, id, d as any))
  safeHandle(CH.PRODUCT_ARCHIVE,     (_e, id:number) => productService.archiveProduct(db, id))
  safeHandle(CH.PRODUCT_LOW_STOCK,   ()              => productService.getLowStockProducts(db))
  safeHandle(CH.PRODUCT_BULK_IMPORT, (_e, rows:unknown[], uid:number) => productService.bulkImportProducts(db, rows as any[], uid))

  // ── Receive stock (purchase receipt) ─────────────────
  safeHandle('products:receiveStock', (_e, input: unknown) => {
    productService.receiveStock(db, input as any)
  })

  // ── Purchase price history ────────────────────────────
  // Returns every time this product was restocked:
  //   who recorded it, which supplier, cost at that time, qty received
  safeHandle('products:priceHistory', (_e, productId: number) => {
    return db.prepare(`
      SELECT
        h.*,
        u.full_name  AS recorder_name,
        s.name       AS supplier_name
      FROM purchase_price_history h
      LEFT JOIN users     u ON h.recorded_by  = u.id
      LEFT JOIN suppliers s ON h.supplier_id  = s.id
      WHERE h.product_id = ?
      ORDER BY h.recorded_at DESC
      LIMIT 50
    `).all([productId])
  })

  // ── Selling price change history ──────────────────────
  // Returns every time a sell price or cost price was changed:
  //   who changed it, old → new values
  safeHandle('products:priceChangeHistory', (_e, productId: number) => {
    return db.prepare(`
      SELECT h.*, u.full_name AS changer_name
      FROM selling_price_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.product_id = ?
      ORDER BY h.changed_at DESC
      LIMIT 50
    `).all([productId])
  })
}
