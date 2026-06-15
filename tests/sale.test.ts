// tests/sale.test.ts
// Integration test: real in-memory SQLite DB, full migrations, then
// exercise completeSale → verify stock decrement, snapshots, and totals.
import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from 'node-sqlite3-wasm'
import { runMigrations } from '../src/main/database/migrate'
import { completeSale } from '../src/main/services/saleService'
import type { DB } from '../src/main/database/connection'

function freshDb(): DB {
  // In-memory DB — fast, isolated per test
  const db = new Database(':memory:') as unknown as DB
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db)
  // Seed one user, one category, one product with stock
  db.prepare(`INSERT INTO users (full_name, username, password_hash, role)
    VALUES ('Test Cashier','tester','x:y','cashier')`).run([])
  db.prepare(`INSERT INTO products (name, unit, cost_price, selling_price, stock_qty)
    VALUES ('Test Item','pcs', 60, 100, 50)`).run([])
  return db
}

function saleInput(productId: number, userId: number, qty: number) {
  return {
    customer_id: null,
    served_by:   userId,
    discount_pct: 0,
    discount_amt: 0,
    tax_amount:   0,
    total_amount: 100 * qty,
    items: [{
      product_id:   productId,
      product_name: 'Test Item',
      unit_price:   100,
      quantity:     qty,
      discount_pct: 0,
      line_total:   100 * qty,
      sell_mode:    'unit',
    }],
    payments: [{ method: 'cash', amount: 100 * qty, reference: null }],
  } as any
}

describe('completeSale', () => {
  let db: DB
  beforeEach(() => { db = freshDb() })

  it('creates a sale and returns a receipt number', () => {
    const r = completeSale(db, saleInput(1, 1, 2))
    expect(r.receiptNo).toMatch(/^INV-\d{8}-\d{4}$/)
    expect(r.saleId).toBeGreaterThan(0)
  })

  it('decrements product stock by the quantity sold', () => {
    completeSale(db, saleInput(1, 1, 3))
    const p = db.prepare('SELECT stock_qty FROM products WHERE id = 1').get([]) as any
    expect(p.stock_qty).toBe(47)   // 50 - 3
  })

  it('snapshots cost price and total cost at moment of sale', () => {
    const r = completeSale(db, saleInput(1, 1, 2))
    const s = db.prepare('SELECT total_cost_amount, items_json FROM sales WHERE id = ?')
      .get([r.saleId]) as any
    expect(s.total_cost_amount).toBe(120)        // 2 × cost 60
    const items = JSON.parse(s.items_json)
    expect(items[0].cost_price).toBe(60)
    expect(items[0].unit_price).toBe(100)
  })

  it('snapshot is immutable when product price changes later', () => {
    const r = completeSale(db, saleInput(1, 1, 2))
    // Change the product price AFTER the sale
    db.prepare('UPDATE products SET cost_price = 999, selling_price = 999 WHERE id = 1').run([])
    const s = db.prepare('SELECT total_cost_amount, items_json FROM sales WHERE id = ?')
      .get([r.saleId]) as any
    expect(s.total_cost_amount).toBe(120)        // unchanged
    expect(JSON.parse(s.items_json)[0].cost_price).toBe(60)
  })

  it('records a stock_adjustment of type sale', () => {
    completeSale(db, saleInput(1, 1, 1))
    const adj = db.prepare("SELECT * FROM stock_adjustments WHERE reason='sale'").get([]) as any
    expect(adj).toBeTruthy()
    expect(adj.qty_change).toBe(-1)
  })

  it('records the payment', () => {
    const r = completeSale(db, saleInput(1, 1, 2))
    const pay = db.prepare('SELECT * FROM payments WHERE sale_id = ?').get([r.saleId]) as any
    expect(pay.method).toBe('cash')
    expect(pay.amount).toBe(200)
  })

  it('generates sequential receipt numbers', () => {
    const a = completeSale(db, saleInput(1, 1, 1))
    const b = completeSale(db, saleInput(1, 1, 1))
    const na = parseInt(a.receiptNo.split('-').pop()!)
    const nb = parseInt(b.receiptNo.split('-').pop()!)
    expect(nb).toBe(na + 1)
  })
})

describe('price auto-switch (pending price countdown)', () => {
  let db: DB
  beforeEach(() => {
    db = freshDb()
    // Set up a pending price switch: new price ₦150 once stock hits 48
    db.prepare(`UPDATE products SET pending_sell_price = 150,
      price_switch_at_qty = 48 WHERE id = 1`).run([])
  })

  it('switches to the new price when stock drops to the threshold', () => {
    // Stock starts at 50, threshold 48 → selling 2 hits it
    completeSale(db, saleInput(1, 1, 2))
    const p = db.prepare(`SELECT selling_price, pending_sell_price, price_switch_at_qty
      FROM products WHERE id = 1`).get([]) as any
    expect(p.selling_price).toBe(150)            // switched
    expect(p.pending_sell_price).toBeNull()      // cleared
    expect(p.price_switch_at_qty).toBeNull()
  })

  it('does NOT switch while stock is above the threshold', () => {
    completeSale(db, saleInput(1, 1, 1))         // 50 → 49, still above 48
    const p = db.prepare('SELECT selling_price, pending_sell_price FROM products WHERE id = 1')
      .get([]) as any
    expect(p.selling_price).toBe(100)            // unchanged
    expect(p.pending_sell_price).toBe(150)       // still pending
  })
})
