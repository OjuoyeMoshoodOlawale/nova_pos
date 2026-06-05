// src/main/handlers/product.handler.ts
import type { DB } from '../database/connection'
import { receiveStock, safeHandle } from '../utils/safeHandle'
import * as productService from '../services/productService'
import { receiveStock, CH } from '@shared/ipcChannels'

export function registerProductHandlers(db: DB): void {
  safeHandle(CH.PRODUCT_ALL,         ()              => productService.getAllProducts(db))
  safeHandle(CH.PRODUCT_SEARCH,      (_e, q: string) => productService.searchProducts(db, q))
  safeHandle(CH.PRODUCT_BARCODE,     (_e, b: string) => productService.findByBarcode(db, b))
  safeHandle(CH.PRODUCT_GET,         (_e, id: number)=> productService.getProductById(db, id))
  safeHandle(CH.PRODUCT_CREATE,      (_e, dto)       => productService.createProduct(db, dto))
  safeHandle(CH.PRODUCT_UPDATE,      (_e, id, dto)   => productService.updateProduct(db, id, dto))
  safeHandle(CH.PRODUCT_ARCHIVE,     (_e, id: number)=> productService.archiveProduct(db, id))
  safeHandle(CH.PRODUCT_LOW_STOCK,   ()              => productService.getLowStockProducts(db))
  safeHandle(CH.PRODUCT_BULK_IMPORT, (_e, rows, uid) => productService.bulkImportProducts(db, rows, uid))

  safeHandle('products:priceHistory', (_e, productId: number) => {
    const db = getDb()
    return db.prepare(`
      SELECT h.*, u.full_name AS recorder_name
      FROM purchase_price_history h
      LEFT JOIN users u ON h.recorded_by = u.id
      WHERE h.product_id = ?
      ORDER BY h.recorded_at DESC LIMIT 50
    `).all([productId])
  })

  safeHandle('products:getLowStock', () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM products WHERE is_active=1 AND stock_qty <= reorder_level ORDER BY stock_qty ASC'
    ).all()
    return rows
  })

  safeHandle('products:receiveStock', (_e, input) => {
    const { receiveStock } = require('../services/productService')
    receiveStock(getDb(), input)
  })

}