// src/main/handlers/inventory.handler.ts
import type { DB } from '../database/connection'
import { withTx } from '../database/connection'
import { safeHandle } from '../utils/safeHandle'
import { CH } from '@shared/ipcChannels'

export function registerInventoryHandlers(db: DB): void {
  safeHandle(CH.INVENTORY_ADJUST, (_e, dto: {
    product_id: number; adjusted_by: number; qty_change: number; reason: string; notes?: string
  }) => {
    const prod = db.prepare('SELECT stock_qty FROM products WHERE id=?').get([dto.product_id]) as {stock_qty:number}
    const qtyBefore = prod.stock_qty
    const qtyAfter  = qtyBefore + dto.qty_change

    return withTx(db, () => {
      db.prepare("UPDATE products SET stock_qty=?, updated_at=datetime('now') WHERE id=?").run([qtyAfter, dto.product_id])
      const r = db.prepare('INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason, notes) VALUES (?,?,?,?,?,?,?)')
        .run([dto.product_id, dto.adjusted_by, qtyBefore, dto.qty_change, qtyAfter, dto.reason, dto.notes??null])
      return db.prepare(`
        SELECT sa.*, p.name AS product_name, u.full_name AS adjuster_name
        FROM stock_adjustments sa
        JOIN products p ON sa.product_id=p.id
        JOIN users u ON sa.adjusted_by=u.id
        WHERE sa.id=?
      `).get([Number(r.lastInsertRowid)])
    })
  })

  safeHandle(CH.INVENTORY_HISTORY, (_e, productId?: number) => {
    const base = `
      SELECT sa.*, p.name AS product_name, u.full_name AS adjuster_name
      FROM stock_adjustments sa
      JOIN products p ON sa.product_id=p.id
      JOIN users u ON sa.adjusted_by=u.id
    `
    if (productId) {
      return db.prepare(`${base} WHERE sa.product_id=? ORDER BY sa.adjusted_at DESC LIMIT 100`).all([productId])
    }
    return db.prepare(`${base} ORDER BY sa.adjusted_at DESC LIMIT 200`).all()
  })

  safeHandle(CH.INVENTORY_OPENING, (_e, items: {name:string; sku?:string; category_id?:number; cost_price:number; selling_price:number; qty:number}[], userId: number) => {
    return withTx(db, () => {
      let count = 0
      for (const item of items) {
        if (!item.name?.trim() || item.qty <= 0) continue
        const r = db.prepare('INSERT INTO products (name, sku, category_id, cost_price, selling_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)')
          .run([item.name.trim(), item.sku??null, item.category_id??null, item.cost_price, item.selling_price, item.qty])
        const pid = Number(r.lastInsertRowid)
        db.prepare('INSERT INTO stock_adjustments (product_id, adjusted_by, qty_before, qty_change, qty_after, reason) VALUES (?,?,0,?,?,?)')
          .run([pid, userId, item.qty, item.qty, 'opening_balance'])
        count++
      }
      return { count }
    })
  })
}
