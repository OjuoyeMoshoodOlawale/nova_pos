// src/main/handlers/product.handler.ts
import type { DB } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import * as productService from '../services/productService'
import { CH } from '@shared/ipcChannels'

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
}
